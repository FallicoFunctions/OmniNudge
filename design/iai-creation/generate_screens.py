#!/usr/bin/env python3
"""Produce the pinned screen artboards from Main.dc.html.

Every screen is the same component with two settings changed, so only Main is
kept under source control. Regenerate, then re-seed the canvas.
"""
import sys

STEP = '"default":1,"min":1'
GENDER = '"gender":{"editor":"enum","options":["","woman","man"],"default":""'

SCREENS = ["Step1Basics", "Step2Look", "Step3Face", "Step4Build", "Step5Start",
           "Step6Interests", "Step7Feeling", "Step8Name", "Step9Meet"]


def with_gender(text, gender):
    out = text.replace(GENDER, GENDER[:-1] + gender + '"')
    if '"default":"%s"' % gender not in out:
        sys.exit("gender marker did not apply -- has the props block changed?")
    return out


def main():
    source = open("Main.dc.html").read()
    if source.count(STEP) != 1 or source.count(GENDER) != 1:
        sys.exit("expected exactly one step and one gender marker in Main.dc.html")

    for index, name in enumerate(SCREENS, start=1):
        pinned = source.replace(STEP, '"default":%d,"min":1' % index)
        # Screen one is where gender is answered, so it alone renders unanswered.
        if index > 1:
            pinned = with_gender(pinned, "woman")
        open(name + ".dc.html", "w").write(pinned)

    # The same screen under the other answer, so the pronoun and the sample art
    # can be compared rather than described.
    open("Step2LookMan.dc.html", "w").write(
        with_gender(source.replace(STEP, '"default":2,"min":1'), "man"))

    print("wrote %d screens" % (len(SCREENS) + 1))


if __name__ == "__main__":
    main()
