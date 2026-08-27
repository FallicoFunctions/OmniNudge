package services

import (
	"context"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"

	zlog "github.com/rs/zerolog/log"

	"github.com/omninudge/backend/internal/models"
)

// Reading the feeds (§32).
//
// Once a day, shared by every character and every reader. The cost does not
// scale with turns, with users, or with messages, which is the whole reason this
// is a job rather than a tool she reaches for mid-sentence.

const (
	// omniChatFeedFetchTimeout bounds one feed. A slow source delays itself and
	// nothing else.
	omniChatFeedFetchTimeout = 20 * time.Second

	// omniChatFeedMaxBytes caps what is read from a source.
	//
	// It was 2MB, which sounded generous and was not: PC Gamer's real feed is
	// 2,097,816 bytes, six hundred over that line. Truncating a document mid-tag
	// makes it unparseable, so the cap would have silently cost that source
	// every headline it ever published, and the only symptom would have been a
	// feed that never contributed anything.
	omniChatFeedMaxBytes = 8 << 20

	// omniChatFeedItemsPerSource bounds what one source contributes, so a
	// prolific feed cannot crowd out every other voice she reads.
	omniChatFeedItemsPerSource = 12

	// omniChatFeedTitleRunes trims a headline. Long enough to say what happened,
	// short enough that nobody can post an essay into her prompt.
	omniChatFeedTitleRunes = 160

	// omniChatReadingWindow is how long a headline stays something she has seen.
	// People forget, and last month's news is not something anybody is carrying
	// around.
	omniChatReadingWindow = 10 * 24 * time.Hour

	// omniChatReadingPerTopic is how many lines of each kind reach the prompt.
	// She skimmed a feed; she did not memorise one.
	omniChatReadingPerTopic = 4

	// omniChatFeedFutureSkew is how far ahead of us a source may be before its
	// dates stop being believable. Feeds get timezones wrong and clocks drift,
	// so a little slack is fair.
	omniChatFeedFutureSkew = time.Hour
)

// OmniChatFeed is one source she reads and what kind of thing it carries.
//
// A slice rather than a schema on purpose: adding a source is a row, the same
// instinct as the game table in §5.
type OmniChatFeed struct {
	Source string
	Topic  string
	URL    string
}

// feedDocument parses RSS and Atom with one struct, because the two differ in
// spelling rather than in substance and she does not care which a site chose.
type feedDocument struct {
	Items []struct {
		Title   string `xml:"title"`
		Link    string `xml:"link"`
		PubDate string `xml:"pubDate"`
		Updated string `xml:"updated"`
	} `xml:"channel>item"`
	Entries []struct {
		Title string `xml:"title"`
		Link  struct {
			HRef string `xml:"href,attr"`
		} `xml:"link"`
		Updated   string `xml:"updated"`
		Published string `xml:"published"`
	} `xml:"entry"`
}

var feedTimeLayouts = []string{
	time.RFC1123Z, time.RFC1123, time.RFC822Z, time.RFC822, time.RFC3339,
	"Mon, 2 Jan 2006 15:04:05 -0700", "2006-01-02T15:04:05Z07:00", "2006-01-02",
}

func parseFeedTime(values ...string) (time.Time, bool) {
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		for _, layout := range feedTimeLayouts {
			if parsed, err := time.Parse(layout, value); err == nil {
				return parsed, true
			}
		}
	}
	return time.Time{}, false
}

// parseFeed turns a fetched document into headlines.
//
// An item with no usable date is dropped rather than dated now. Stamping it with
// the fetch time would make every source's whole backlog look like it happened
// today, the first time a feed was read.
//
// An item dated in the future is dropped too, and that one is not fussiness.
// Recent orders by publication date and Forget only removes what is older than
// the window, so a single item stamped next year would sit at the top of every
// character's reading permanently and could never age out. One typo in one feed
// would be forever.
func parseFeed(feed OmniChatFeed, body []byte, now time.Time) []models.OmniChatFeedItem {
	cutoff := now.Add(-omniChatReadingWindow)
	horizon := now.Add(omniChatFeedFutureSkew)
	var document feedDocument
	if err := xml.Unmarshal(body, &document); err != nil {
		return nil
	}
	items := make([]models.OmniChatFeedItem, 0, omniChatFeedItemsPerSource)

	add := func(title, link string, times ...string) {
		if len(items) >= omniChatFeedItemsPerSource {
			return
		}
		title = truncateFeedTitle(title)
		link = strings.TrimSpace(link)
		if title == "" || link == "" {
			return
		}
		published, ok := parseFeedTime(times...)
		if !ok || published.Before(cutoff) || published.After(horizon) {
			return
		}
		items = append(items, models.OmniChatFeedItem{
			Source: feed.Source, Topic: feed.Topic, Title: title, Link: link, PublishedAt: published,
		})
	}

	for _, item := range document.Items {
		add(item.Title, item.Link, item.PubDate, item.Updated)
	}
	for _, entry := range document.Entries {
		add(entry.Title, entry.Link.HRef, entry.Published, entry.Updated)
	}
	return items
}

func truncateFeedTitle(title string) string {
	title = strings.Join(strings.Fields(strings.TrimSpace(title)), " ")
	runes := []rune(title)
	if len(runes) <= omniChatFeedTitleRunes {
		return title
	}
	return strings.TrimSpace(string(runes[:omniChatFeedTitleRunes])) + "…"
}

// omniChatFeedUserAgent identifies us to the sources we read.
const omniChatFeedUserAgent = "OmniNudge/1.0 (+https://omninudge.com)"

type omniChatFeedStore interface {
	Record(ctx context.Context, items []models.OmniChatFeedItem) (int, error)
	Forget(ctx context.Context, olderThan time.Duration) (int64, error)
}

// OmniChatReadingService keeps the feed table current.
type OmniChatReadingService struct {
	store  omniChatFeedStore
	feeds  []OmniChatFeed
	client *http.Client
	now    func() time.Time
}

func NewOmniChatReadingService(store omniChatFeedStore, feeds []OmniChatFeed) *OmniChatReadingService {
	return &OmniChatReadingService{
		store:  store,
		feeds:  feeds,
		client: &http.Client{Timeout: omniChatFeedFetchTimeout},
		now:    time.Now,
	}
}

// Refresh reads every source once and stores what is new.
//
// One source failing is not the run failing. A feed that is down, slow, or
// serving nonsense should cost her that source and nothing else.
func (s *OmniChatReadingService) Refresh(ctx context.Context) (int, error) {
	if s == nil || s.store == nil {
		return 0, nil
	}
	now := s.now()
	stored := 0
	for _, feed := range s.feeds {
		items, err := s.read(ctx, feed, now)
		if err != nil {
			zlog.Warn().Err(err).Str("source", feed.Source).Msg("omnichat reading: source unavailable")
			continue
		}
		// A partial failure still stored whatever it could, so the count is
		// taken either way and only the trouble is logged.
		count, err := s.store.Record(ctx, items)
		if err != nil {
			zlog.Warn().Err(err).Str("source", feed.Source).Msg("omnichat reading: some items could not be stored")
		}
		stored += count
	}
	if _, err := s.store.Forget(ctx, omniChatReadingWindow); err != nil {
		zlog.Warn().Err(err).Msg("omnichat reading: could not forget old items")
	}
	return stored, nil
}

func (s *OmniChatReadingService) read(ctx context.Context, feed OmniChatFeed, now time.Time) ([]models.OmniChatFeedItem, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, feed.URL, nil)
	if err != nil {
		return nil, err
	}
	// Named on purpose. Plenty of sources refuse an unidentified client, and a
	// feed that 403s us is a source she silently stops reading.
	request.Header.Set("User-Agent", omniChatFeedUserAgent)
	request.Header.Set("Accept", "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8")
	response, err := s.client.Do(request)
	if err != nil {
		return nil, err
	}
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("omnichat reading: %s returned %d", feed.Source, response.StatusCode)
	}
	// One byte past the cap, so hitting it is detectable. A truncated document
	// does not parse, and a source that quietly returns nothing looks exactly
	// like a source with no news.
	body, err := io.ReadAll(io.LimitReader(response.Body, omniChatFeedMaxBytes+1))
	if err != nil {
		return nil, err
	}
	if len(body) > omniChatFeedMaxBytes {
		return nil, fmt.Errorf("omnichat reading: %s is larger than %d bytes", feed.Source, omniChatFeedMaxBytes)
	}
	return parseFeed(feed, body, now), nil
}

// renderRecentReading is what she has seen lately.
//
// Every line carries who ran it and nothing about whether they are worth
// believing. §32 refuses to rank sources, and attribution is also what makes an
// instruction hidden in a headline read as somebody saying a strange thing
// rather than as something to do.
//
// It says what she saw. It does not tell her to bring any of it up.
func renderRecentReading(items []models.OmniChatFeedItem) string {
	if len(items) == 0 {
		return ""
	}
	var builder strings.Builder
	builder.WriteString("\n\n[What You Have Seen]\n")
	builder.WriteString("Headlines you have come across lately, with who ran them. What you make of any of it is yours.\n")
	for _, item := range items {
		fmt.Fprintf(&builder, "- %s: %s\n", item.Source, item.Title)
	}
	return strings.TrimRight(builder.String(), "\n")
}

// DefaultOmniChatFeeds is the reading list. Adding a source is a row, the same
// instinct as the game table in §5 -- new behaviour arrives as data rather than
// as another branch.
//
// Game sources first, because these characters are made of games and missing a
// patch is a worse tell than missing the news.
var DefaultOmniChatFeeds = []OmniChatFeed{
	{Source: "PC Gamer", Topic: models.OmniChatFeedTopicGames, URL: "https://www.pcgamer.com/rss/"},
	{Source: "Eurogamer", Topic: models.OmniChatFeedTopicGames, URL: "https://www.eurogamer.net/feed"},
	{Source: "Rock Paper Shotgun", Topic: models.OmniChatFeedTopicGames, URL: "https://www.rockpapershotgun.com/feed"},
	{Source: "BBC News", Topic: models.OmniChatFeedTopicWorld, URL: "https://feeds.bbci.co.uk/news/world/rss.xml"},
	{Source: "NPR", Topic: models.OmniChatFeedTopicWorld, URL: "https://feeds.npr.org/1001/rss.xml"},
}

type omniChatFeedReader interface {
	Recent(ctx context.Context, topic string, within time.Duration, limit int) ([]models.OmniChatFeedItem, error)
}

// recentReadingFor is what this character has seen lately.
//
// Only a character who lives here reads anything. A roleplay character is a part
// being played, and handing her this morning's headlines breaks whatever her
// creator set her scene in -- the same reason §32's clock is hers alone.
func recentReadingFor(ctx context.Context, reader omniChatFeedReader, persona *models.BotPersona) []models.OmniChatFeedItem {
	if reader == nil || !personaLivesHere(persona) {
		return nil
	}
	items := make([]models.OmniChatFeedItem, 0, omniChatReadingPerTopic*2)
	for _, topic := range []string{models.OmniChatFeedTopicGames, models.OmniChatFeedTopicWorld} {
		found, err := reader.Recent(ctx, topic, omniChatReadingWindow, omniChatReadingPerTopic)
		if err != nil {
			// She has not read the news today. That is a thing that happens to
			// people, and it is not a reason to fail the reply.
			zlog.Warn().Err(err).Str("topic", topic).Msg("omnichat reading: could not read recent items")
			continue
		}
		items = append(items, found...)
	}
	// Merged, not concatenated. Each topic comes back newest-first, so glueing
	// them together leaves a flat list where a week-old game headline sits above
	// this morning's news for no reason a reader could see.
	sort.SliceStable(items, func(a, b int) bool {
		return items[a].PublishedAt.After(items[b].PublishedAt)
	})
	return items
}
