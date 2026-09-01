#!/usr/bin/env python3
"""Check the flow against the server it is drawn from.

The mockup hard-codes what the real screens fetch from GET /omnichat/omniai/options
and /omnichat/omniai/names, so it can drift. Everything below has drifted at least
once: the interest list, the starting states, and the tier cards on the refusal
screen -- which advertised two characters on a plan that allows none, and sold
Plus as unlocking a character that needs Premium.

Run it before re-seeding the canvas.
"""
import re
import sys

BACKEND = "../../backend/internal/services/"


def read(name):
    return open(BACKEND + name).read()


def between(text, start_marker, end_marker):
    """Keys inside an explicitly delimited region.

    Deliberately dumb. Four cleverer versions of this went wrong in ways that
    reported drift where there was none -- a greedy match running into the next
    list, a marker that appears in two lists ("guarded" is a trait and a
    starting state), a bracket scanner off by one level.
    """
    a = text.index(start_marker) + len(start_marker)
    return re.findall(r"\['([a-z_]+)'", text[a:text.index(end_marker, a)])


def main():
    seed, creation = read("omnichat_omniai_seed.go"), read("omnichat_omniai_creation.go")
    appearance, hair = read("omnichat_omniai_appearance.go"), read("omnichat_omniai_hair.go")
    names_src, limits = read("omnichat_omniai_names.go"), read("omnichat_creation_limits.go")
    design = open("Main.dc.html").read()

    def go_strings(src, name):
        return re.findall(r'"([^"]+)"', re.search(r"%s\s*=\s*\[\]string\{([^}]*)\}" % name, src, re.S).group(1))

    lists = [
        ("traits", re.findall(r'\{Key: "(\w+)", Mood:', seed),
         between(design, "label: 'Traits'", "s.temperaments, this.many")),
        ("feelings", re.findall(r'\{Key: "(\w+)", Warmth:', seed),
         between(design, "' with you', counter:", "s.feeling, this.one")),
        ("relationships", re.findall(r'\{Key: "(\w+)", Attraction:', read("omnichat_omniai_relationship.go")),
         between(design, "label: 'What you are to each other'", "s.relationship, this.one")),
        ("interests", re.findall(r'\{Key: "(\w+)", Reads:', creation),
         between(design, "const all = [", "\n      ];")),
        ("ethnicity", go_strings(appearance, "omniAIEthnicities"),
         between(design, "ethnicity: [", "\n      ],")),
        ("hair length", go_strings(hair, "omniAIHairLengths"),
         between(design, "hairLength: [", "\n      ],")),
        ("hair colour", go_strings(appearance, "omniAIHairColours"),
         between(design, "hairColour: [", "\n      ]")),
    ]

    problems = []
    for label, server, flow in lists:
        ok = server == flow
        print(("ok  " if ok else "!!  ") + "%-12s %2d" % (label, len(flow)))
        if not ok:
            problems.append("%s\n  server=%s\n  flow  =%s" % (label, server, flow))

    # Names, from the tables only. Prose in a comment is not data.
    def table_lines(text):
        return "\n".join(l for l in text.splitlines() if not l.strip().startswith("//"))

    server_names = set(re.findall(r'"([A-Z][a-z]+)"', table_lines(names_src[names_src.index("var omniAISharedNames"):])))
    pool = design[design.index("const NAME_POOL"):design.index("const nameSuggestions")]
    flow_names = set(re.findall(r"'([A-Z][a-z]+)'", table_lines(pool)))
    ok = server_names == flow_names
    print(("ok  " if ok else "!!  ") + "%-12s %2d" % ("names", len(flow_names)))
    if not ok:
        problems.append("names\n  only on the server: %s\n  only in the flow  : %s" % (
            sorted(server_names - flow_names), sorted(flow_names - server_names)))

    # The tier cards, which are a promise about what somebody gets for money.
    allowed = {plan: int(n) for plan, n in re.findall(r'models\.Plan(\w+):\s*(\d+),', limits)}
    omniai_plan = re.search(r'return models\.Plan(\w+) \}', creation).group(1)
    screen = open("NeedsUpgrade.dc.html").read()
    for card, body in re.findall(r'<h2[^>]*>(\w+)</h2>(.*?)</article>', screen, re.S):
        plan = {"Standard": "Free", "Plus": "Plus", "Premium": "Premium"}[card]
        written = re.search(r'>(?:No characters of your own|(\d+) characters you write)\.<', body)
        count = 0 if written.group(1) is None else int(written.group(1))
        offers = "One who is her own" in body
        ok = count == allowed[plan] and offers == (plan == omniai_plan)
        print(("ok  " if ok else "!!  ") + "%-12s %s: %d written, OmniAI %s" % (
            "tier card", card, count, "yes" if offers else "no"))
        if not ok:
            problems.append("the %s card promises %d characters and %s an OmniAI; the server "
                            "allows %d and requires %s" % (card, count, "offers" if offers else "withholds",
                                                           allowed[plan], omniai_plan))

    print()
    if problems:
        print("\n".join(problems))
        sys.exit(1)
    print("the flow matches the server everywhere it claims to")


if __name__ == "__main__":
    main()
