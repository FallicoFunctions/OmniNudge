import type { TFunction } from 'i18next';

/**
 * Human wording for the keys the server sends.
 *
 * The server sends keys and never labels, deliberately: how an answer is spoken
 * is the interface's business, and it is what lets "latino" read as Latina or
 * Latino without the server knowing anything about it.
 *
 * Every string goes through t() with an English default rather than being added
 * to the locale files. The sidebar already does this with fallbackLabel. It
 * means a translator can pick these up later without anybody having invented a
 * Spanish or Arabic wording for forty interests today.
 */

const DEFAULTS: Record<string, string> = {
  // Look.
  'style.realistic': 'Realistic',
  'style.anime': 'Anime',
  'gender.woman': 'A woman',
  'gender.man': 'A man',

  // Ethnicity. "latino" is spoken as Latina or Latino by gender; see labelFor.
  'ethnicity.white': 'White / Caucasian',
  'ethnicity.black': 'Black',
  'ethnicity.east_asian': 'East Asian',
  'ethnicity.south_asian': 'South Asian',
  'ethnicity.southeast_asian': 'Southeast Asian',
  'ethnicity.latino': 'Latina',
  'ethnicity.middle_eastern': 'Middle Eastern / Arab',
  'ethnicity.pacific_islander': 'Pacific Islander',
  'ethnicity.indigenous': 'Indigenous / Native',
  'ethnicity.mixed': 'Mixed',
  'ethnicity.other': 'Other',

  // Hair.
  'hair_length.shaved': 'Shaved',
  'hair_length.buzzed': 'Buzzed',
  'hair_length.short': 'Short',
  'hair_length.medium': 'Medium',
  'hair_length.long': 'Long',
  'hair_length.very_long': 'Very long',
  'hair_texture.straight': 'Straight',
  'hair_texture.wavy': 'Wavy',
  'hair_texture.curly': 'Curly',
  'hair_texture.coily': 'Coily',
  'hair_style.natural': 'Unstyled',
  'hair_style.middle_part': 'Middle part',
  'hair_style.side_part': 'Side part',
  'hair_style.bangs': 'Bangs',
  'hair_style.ponytail': 'Ponytail',
  'hair_style.braids': 'Braids',
  'hair_style.cornrows': 'Cornrows',
  'hair_style.locs': 'Locs',
  'hair_style.afro': 'Afro',
  'hair_style.curtain_bangs': 'Curtain bangs',
  'hair_style.bob': 'Bob',
  'hair_style.pixie': 'Pixie',
  'hair_style.high_ponytail': 'High ponytail',
  'hair_style.bun': 'Bun',
  'hair_style.messy_bun': 'Messy bun',
  'hair_style.half_up': 'Half-up',
  'hair_style.pigtails': 'Pigtails',
  'hair_style.fringe': 'Fringe',
  'hair_style.curtains': 'Curtains',
  'hair_style.textured': 'Textured',
  'hair_style.slicked_back': 'Slicked back',
  'hair_style.quiff': 'Quiff',
  'hair_style.pompadour': 'Pompadour',
  'hair_style.crew_cut': 'Crew cut',
  'hair_style.undercut': 'Undercut',
  'hair_style.fade': 'Fade',
  'hair_style.man_bun': 'Man bun',
  'hair_colour.black': 'Black',
  'hair_colour.dark_brown': 'Dark brown',
  'hair_colour.brown': 'Brown',
  'hair_colour.light_brown': 'Light brown',
  'hair_colour.blonde': 'Blonde',
  'hair_colour.red': 'Red',
  'hair_colour.auburn': 'Auburn',
  'hair_colour.strawberry_blonde': 'Strawberry blonde',
  'hair_colour.gray': 'Gray',
  'hair_colour.white': 'White',
  'hair_colour.platinum_blonde': 'Platinum blonde',
  'hair_colour.pink': 'Pink',
  'hair_colour.purple': 'Purple',
  'hair_colour.blue': 'Blue',
  'hair_colour.green': 'Green',
  'hair_colour.silver': 'Silver',

  // Eyes. The last three are offered on anime only.
  'eyes.brown': 'Brown',
  'eyes.dark_brown': 'Dark brown',
  'eyes.blue': 'Blue',
  'eyes.green': 'Green',
  'eyes.grey': 'Grey',
  'eyes.hazel': 'Hazel',
  'eyes.amber': 'Amber',
  'eyes.violet': 'Violet',
  'eyes.crimson': 'Crimson',
  'eyes.gold': 'Gold',

  // Build.
  'build.slim': 'Slim',
  'build.lean': 'Lean',
  'build.average': 'Average',
  'build.athletic': 'Athletic',
  'build.curvy': 'Curvy',
  'build.muscular': 'Muscular',
  'build.stocky': 'Stocky',
  'build.heavy': 'Heavy',
  'build.plus_size': 'Plus size',

  // Traits, in the pairs the server orders them in.
  'trait.warm': 'Warm',
  'trait.guarded': 'Guarded',
  'trait.outgoing': 'Outgoing',
  'trait.quiet': 'Quiet',
  'trait.playful': 'Playful',
  'trait.serious': 'Serious',
  'trait.blunt': 'Blunt',
  'trait.tactful': 'Tactful',
  'trait.dry': 'Dry',
  'trait.earnest': 'Earnest',
  'trait.confident': 'Confident',
  'trait.reserved': 'Reserved',
  'trait.curious': 'Curious',
  'trait.restless': 'Restless',
  'trait.steady': 'Steady',
  'trait.sensitive': 'Sensitive',
  'trait.sharp': 'Sharp',
  'trait.easygoing': 'Easygoing',

  // Interests.
  'interest.games': 'Games',
  'interest.anime': 'Anime',
  'interest.comics': 'Comics',
  'interest.film': 'Films',
  'interest.music': 'Music',
  'interest.reading': 'Reading',
  'interest.horror': 'Horror',
  'interest.true_crime': 'True crime',
  'interest.mysteries': 'Mysteries',
  'interest.comedy': 'Comedy',
  'interest.theatre': 'Theatre',
  'interest.writing': 'Writing',
  'interest.poetry': 'Poetry',
  'interest.art': 'Art',
  'interest.photography': 'Photography',
  'interest.crafts': 'Crafts',
  'interest.fashion': 'Fashion',
  'interest.architecture': 'Architecture',
  'interest.cooking': 'Cooking',
  'interest.baking': 'Baking',
  'interest.coffee': 'Coffee',
  'interest.sports': 'Sport',
  'interest.fitness': 'Fitness',
  'interest.martial_arts': 'Martial arts',
  'interest.dance': 'Dance',
  'interest.hiking': 'Hiking',
  'interest.nature': 'Nature',
  'interest.animals': 'Animals',
  'interest.gardening': 'Gardening',
  'interest.travel': 'Travel',
  'interest.languages': 'Languages',
  'interest.history': 'History',
  'interest.mythology': 'Mythology',
  'interest.philosophy': 'Philosophy',
  'interest.psychology': 'Psychology',
  'interest.science': 'Science',
  'interest.space': 'Space',
  'interest.technology': 'Technology',
  'interest.cars': 'Cars',
  'interest.current_events': 'Current events',

  // Where the relationship begins, and whether she is drawn to you.
  'feeling.guarded': 'Guarded',
  'feeling.neutral': 'Neutral',
  'feeling.curious': 'Curious',
  'feeling.fond': 'Fond',
  'feeling.close': 'Close',
  'feeling.devoted': 'Devoted',
  'attraction.none': 'Not at all',
  'attraction.some': 'Somewhat',
  'attraction.strong': 'Very',
};

/** Glosses, only where the word alone does not say enough. */
const GLOSSES: Record<string, string> = {
  'trait.warm': 'Open with people',
  'trait.guarded': 'Slow to let you in',
  'trait.outgoing': 'Comes alive around people',
  'trait.quiet': 'Says little, by choice',
  'trait.playful': 'Teases before anything else',
  'trait.serious': 'Rarely treats things lightly',
  'trait.blunt': 'Says the hard thing',
  'trait.dry': 'Understated, deadpan',
  'trait.confident': 'Comfortable taking the lead',
  'trait.reserved': 'Keeps the feeling out of it',
  'trait.curious': 'Wants to know more',
  'trait.restless': 'Never settles for long',
  'trait.steady': 'Hard to knock off course',
  'trait.sensitive': 'Feels things deeply',
  'trait.sharp': 'Quick-witted, notices everything',
  'trait.easygoing': 'Does not sweat much',
  'feeling.guarded': 'Does not trust you yet',
  'feeling.neutral': 'You are someone new',
  'feeling.curious': 'Wants to know you',
  'feeling.fond': 'Already likes you',
  'feeling.close': 'Already trusts you',
  'feeling.devoted': 'You matter most',
};

/** Glosses that name the character, and so depend on the answer to screen one. */
const GENDERED_GLOSSES: Record<string, (poss: string, subj: string, s: string) => string> = {
  'trait.tactful': (poss) => `Chooses ${poss} words`,
  'trait.earnest': (_poss, subj, s) => `Means what ${subj} say${s}`,
};

export function labelFor(t: TFunction, field: string, key: string, gender?: string): string {
  const id = `${field}.${key}`;
  // The one label the server cannot supply, because it depends on another answer.
  if (id === 'ethnicity.latino' && gender === 'man') {
    return t('omnichat.iai.ethnicity.latino_man', 'Latino');
  }
  return t(`omnichat.iai.${id}`, DEFAULTS[id] ?? key);
}

export function glossFor(
  t: TFunction,
  field: string,
  key: string,
  pronouns: { poss: string; subj: string; s: string }
): string {
  const id = `${field}.${key}`;
  const gendered = GENDERED_GLOSSES[id];
  if (gendered) {
    return t(`omnichat.iai.gloss.${id}`, gendered(pronouns.poss, pronouns.subj, pronouns.s));
  }
  const plain = GLOSSES[id];
  return plain ? t(`omnichat.iai.gloss.${id}`, plain) : '';
}
