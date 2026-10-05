"""Rebuild the complete pair from retained sources without editing them."""

import argparse
import shutil
import subprocess
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
ROOT = SCRIPTS.parents[1]
STUDY = ROOT / "assets-src/avatars/complete-pair-study"
p = argparse.ArgumentParser()
p.add_argument(
    "--blender", default=shutil.which("blender") or "/opt/homebrew/bin/blender"
)
p.add_argument(
    "--export-only",
    action="store_true",
    help="Reuse the finished native looks and regenerate runtime files.",
)
p.add_argument("--expressions-only", action="store_true", help="Reuse fitted garments and rebuild facial/groom controls and runtime assets.")
args = p.parse_args()
logs = STUDY / "build-logs"
logs.mkdir(parents=True, exist_ok=True)


def blender(script, sex=None, extra=()):
    command = [
        args.blender,
        "-b",
        "--python-exit-code",
        "1",
        "--python",
        str(SCRIPTS / script),
    ]
    if sex:
        command += ["--", "--sex", sex]
    if extra:
        command += list(extra) if sex else ["--", *extra]
    with (logs / (Path(script).stem + ("-" + sex if sex else "") + ".log")).open(
        "w"
    ) as output:
        print("Building", script, sex or "", flush=True)
        subprocess.run(
            command,
            cwd=ROOT.parent,
            stdout=output,
            stderr=subprocess.STDOUT,
            check=True,
        )


if not args.export_only and not args.expressions_only:
    for script in [
        "prepare_complete_assets.py",
        "prepare_complete_jacket.py",
        "prepare_complete_face.py",
    ]:
        blender(script)
    for sex in ["male", "female"]:
        blender("assemble_complete_pair.py", sex)
        if sex == "female":
            blender("fit_female_launch_jacket.py")
        for script in [
            "build_launch_silhouettes.py",
            "refine_launch_faces.py",
            "add_launch_reference_details.py",
        ]:
            blender(script, sex)
        if sex == "female":
            blender("finish_female_launch_jacket.py")
        blender("finish_complete_looks.py", sex)
    blender("finish_male_groom.py")

cli = ROOT / "scripts/transform-asset.mjs"
if not args.expressions_only:
    for sex in ["male", "female"]:
        blender("polish_complete_pair.py", sex)
        blender("export_complete_pair.py", sex, ("--polished",))
    blender("fit_complete_motion.py")
    blender("resolve_complete_contact.py")
for sex in ["male", "female"]:
    blender("refine_complete_head_details.py", sex)
    blender("refine_complete_drape.py", sex)
    blender("refine_complete_silhouettes.py", sex)
    blender("refine_complete_surfaces.py", sex, ("--silhouette-refined",))
    blender("refine_complete_footwear.py", sex)
    blender("refine_complete_outfit_details.py", sex)
    blender("refine_complete_upper_finish.py", sex)
    blender("refine_complete_groom_finish.py", sex)
    blender("refine_complete_jacket_finish.py", sex)
    blender("refine_complete_jacket_shape.py", sex)
    blender("refine_complete_layer_clearance.py", sex)
    blender("refine_complete_pocket_construction.py", sex)
    blender("refine_complete_opening_construction.py", sex)
    blender("refine_complete_knit_finish.py", sex)
    blender("refine_complete_face_finish.py", sex)
    blender("refine_complete_crop_finish.py", sex)
    blender("refine_complete_male_hair.py", sex)
    blender("refine_complete_foil_finish.py", sex)
    blender("refine_complete_transmission.py", sex)
    blender("refine_complete_final_forms.py", sex)
    blender("author_complete_expressions.py", sex, ("--final-forms",))
    blender("export_complete_pair.py", sex, ("--expressive",))
    runtime = ROOT / f"public/assets/avatars/complete-pair/{sex}.glb"
    optimized = runtime.with_suffix(".optimized.glb")
    with (logs / f"optimize-{sex}.log").open("w") as output:
        subprocess.run(
            [
                "node",
                str(cli),
                "complete-avatar",
                str(runtime),
                str(optimized),
            ],
            cwd=ROOT,
            stdout=output,
            stderr=subprocess.STDOUT,
            check=True,
        )
    optimized.replace(runtime)
    shutil.copy2(
        ROOT / f"assets-src/avatars/launch-body-proof/{sex}-original.png",
        runtime.parent / f"{sex}-reference.png",
    )
subprocess.run(["node", str(SCRIPTS / "finalize_complete_tangents.mjs")], cwd=ROOT, check=True)
subprocess.run(["node", str(SCRIPTS / "pack_complete_jacket_materials.mjs")], cwd=ROOT, check=True)
blender("audit_complete_pair_motion.py")
blender("audit_complete_expressions.py")
blender("audit_complete_crop_finish.py")
blender("audit_complete_male_hair.py")
blender("audit_complete_foil_finish.py")
blender("audit_complete_transmission.py")
blender("audit_complete_final_forms.py")
blender("audit_complete_footwear.py")
blender("audit_complete_outfit_details.py")
blender("audit_complete_groom.py")
blender("audit_complete_jacket_finish.py")
blender("audit_complete_jacket_shape.py")
for sex in ["male", "female"]:
    blender("refine_complete_layer_clearance.py", sex, ("--audit",))
blender("audit_complete_pocket_construction.py")
blender("audit_complete_opening_construction.py")
blender("audit_complete_knit_finish.py")
subprocess.run(
    ["node", str(SCRIPTS / "validate_complete_pair.mjs")], cwd=ROOT, check=True
)

subprocess.run(["node", str(SCRIPTS / "build_complete_lods.mjs")], cwd=ROOT, check=True)

# Apply the reference finish to freshly exported geometry at all detail levels.
# The optical patch checks that every mesh, joint and animation is retained.
for sex in ["male", "female"]:
    blender("refine_complete_visual_finish.py", sex, ("--source-suffix", "runtime"))
    shutil.copy2(STUDY / f"{sex}-visual-refined.blend", STUDY / f"{sex}-runtime.blend")
subprocess.run(["node", str(SCRIPTS / "apply_complete_visual_finish.mjs")], cwd=ROOT, check=True)
blender("refine_complete_hairline.py", extra=("--source-suffix", "runtime"))
shutil.copy2(STUDY / "female-hairline-refined.blend", STUDY / "female-runtime.blend")
subprocess.run(["node", str(SCRIPTS / "apply_complete_hairline.mjs")], cwd=ROOT, check=True)
blender("audit_complete_groom.py")
blender("audit_complete_foil_finish.py")
blender("audit_complete_transmission.py")
blender("audit_complete_knit_finish.py")
subprocess.run(["node", str(SCRIPTS / "validate_complete_knit_materials.mjs")], cwd=ROOT, check=True)

subprocess.run(["node", str(SCRIPTS / "validate_complete_foil_materials.mjs")], cwd=ROOT, check=True)

subprocess.run(["node", str(SCRIPTS / "validate_complete_transmission.mjs")], cwd=ROOT, check=True)
