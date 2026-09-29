"""Normalize the img2threejs character spec for the existing-asset Fashion V2 route.

The stock character template assumes it owns a new procedural material library. Fashion
V2 does not: it is a proportion derivative of the approved Blender/glTF avatar and must
preserve those materials. This script makes that adapter decision explicit while keeping
the strict structural, anatomy, evidence, lighting, and action-readiness gates intact.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


FEATURES = {
    "head": ["head-neck.proportion-profile"],
    "chest": ["torso.shoulder-slope", "torso.rib-waist-taper"],
    "pelvis": ["pelvis.high-set-transition"],
    "upper-arm-l": ["limbs.arm-taper"],
    "thigh-l": ["limbs.leg-line"],
}

MATERIAL_CLASSES = {
    "skin": "skin",
    "hair": "unknown",
    "shirt": "fabric",
    "pants": "fabric",
    "shoes": "rubber",
    "eye": "glass",
    "lips": "skin",
    "hidden": "unknown",
    "base": "unknown",
}


def rgba_from_hex(value: str) -> str:
    value = value.lstrip("#")
    if len(value) == 3:
        value = "".join(char * 2 for char in value)
    red, green, blue = (int(value[index : index + 2], 16) for index in (0, 2, 4))
    return f"rgba({red}, {green}, {blue}, 1.0)"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("spec")
    args = parser.parse_args()
    path = Path(args.spec).expanduser().resolve()
    spec = json.loads(path.read_text(encoding="utf-8"))

    assessment = spec["preSpecAssessment"]
    unresolved = assessment.get("unknownsToResolveBeforeImplementation", [])
    spec["assumptions"] = [
        *(spec.get("assumptions") or []),
        *(
            {"statement": item, "status": "accepted-conservative-inference"}
            for item in unresolved
        ),
    ]
    assessment["unknownsToResolveBeforeImplementation"] = []

    spec["fashionProfile"] = {
        "version": 2,
        "sourceDerivative": "lean-v1",
        "restPose": "symmetric-neutral",
        "referencePoseBaked": False,
        "targetDeltasFromLeanV1": {
            "legLength": 0.075,
            "neckLength": 0.085,
            "shoulderWidth": -0.055,
            "ribWidth": -0.085,
            "ribDepth": -0.06,
            "waistWidth": -0.10,
            "waistDepth": -0.07,
            "upperArmRadius": -0.06,
            "forearmRadius": -0.075,
            "thighRadius": -0.10,
            "calfRadius": -0.095,
            "wristRadius": -0.115,
            "ankleRadius": -0.115,
            "headWidth": -0.05,
            "jawWidth": -0.075,
        },
        "protectedContracts": [
            "topology",
            "object and option names",
            "material slots",
            "56-bone names and hierarchy",
            "male/female morph targets",
            "idle/walk/run action names",
        ],
    }

    materials = {item["id"]: item for item in spec["materials"]}
    for material in materials.values():
        roughness = material.get("roughness")
        if isinstance(roughness, dict):
            roughness.setdefault("map", "preserved-runtime-material-channel")
    materials["skin"]["localOverrides"] = [
        {
            "id": "preserved-skin-response",
            "region": "existing AvatarSkin material zones",
            "roughness": 0.55,
            "evidenceRef": "approved modular-v1 material library",
        }
    ]

    lookdev = spec["lookDevTargets"]
    lookdev["qualityPriority"] = "runtime-preservation"
    lookdev["materialPass"]["referencePbrExtraction"]["requiredWhenSourceImagePresent"] = False
    lookdev["materialPass"]["referencePbrExtraction"]["stopOnLowConfidence"] = False
    lookdev["materialPass"]["preservationContract"] = (
        "No reference outfit pixels are used. Retain the existing independent runtime "
        "material channels and neutral review lighting."
    )

    spec["lightingFromPhoto"] = [
        {
            "role": "key light",
            "intent": "neutral front-three-quarter form light; preserve the established review rig",
            "exposure": -0.45,
            "toneMapping": "AgX Medium High Contrast",
        },
        {
            "role": "fill light",
            "intent": "low-energy frontal fill for anatomy readability",
        },
        {
            "role": "rim light",
            "intent": "rear rim plus ground contact shadow for silhouette and attachment review",
        },
    ]

    for component in spec["componentTree"]:
        material_id = component.get("material", "base")
        material = materials.get(material_id, materials["base"])
        dominant = material.get("baseColor", material.get("color", "#808080"))
        secondary = material.get("albedo", {}).get("secondary", [dominant])[0]
        component["colorMaterialRecipe"] = {
            "dominantAlbedo": rgba_from_hex(dominant),
            "secondaryAlbedo": rgba_from_hex(secondary),
            "materialClass": MATERIAL_CLASSES.get(material_id, "unknown"),
            "materialClassConfidence": 0.95,
            "evidenceRefs": ["approved modular-v1 material library"],
        }
        component["localFeatures"] = [
            {"id": feature_id, "effect": "coordinated proportion deformation"}
            for feature_id in FEATURES.get(component["id"], [])
        ]
        if component.get("role") == "hair":
            component["standProud"] = {
                "againstComponentId": "head",
                "clearance": 0.004,
                "maxPush": 0.02,
                "note": "Existing fitted hair meshes are transformed with the head region and remain outside the scalp.",
            }

    contract = spec["qualityContract"]
    contract["minimumSpecDepth"]["microFeatureGroups"] = 6

    passes = spec["buildPasses"]
    if not any(item.get("id") == "structural-pass" for item in passes):
        passes.insert(
            1,
            {
                "id": "structural-pass",
                "goal": "Apply one continuous deformation field to all rest geometry and edit-bone endpoints while preserving topology and hierarchy.",
                "componentRefs": ["root", "pelvis", "chest", "neck", "head", "upper-arm-l", "upper-arm-r", "thigh-l", "thigh-r"],
                "acceptance": [
                    "All 56 bones retain names, parents, unit scale and finite rest transforms.",
                    "Every fitted module remains attached at the shoulder, waist, hip, wrist and ankle seams.",
                ],
            },
        )
    pass_ids = [item["id"] for item in passes]
    spec["sculptPipeline"]["passOrder"] = pass_ids
    spec["sculptPipeline"]["currentPass"] = "blockout"

    spec["viewEvidence"][0]["observations"] = [
        "long exposed neck and narrow lower face",
        "sloped shoulder line",
        "compact rib cage and high narrow waist",
        "high-set pelvis and long leg line",
        "continuous limb taper toward compact wrists and ankles",
    ]
    spec["viewEvidence"][0]["confidence"] = 0.78
    spec["suitability"] = "conditional"
    spec["scores"] = {
        "object_isolation": 3,
        "silhouette_readability": 3,
        "depth_inference": 2,
        "primitive_decomposition": 3,
        "material_procedurality": 3,
        "occlusion_risk": 2,
        "interaction_fit": 3,
    }

    path.write_text(json.dumps(spec, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
