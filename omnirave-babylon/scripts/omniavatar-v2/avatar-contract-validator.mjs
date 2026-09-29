import { basename } from 'node:path';

function finding(severity, code, message, location = null) {
  return { severity, code, message, ...(location ? { location } : {}) };
}

function names(values) {
  return new Set(values.map((value) => value.name));
}

function duplicateNames(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (!value.name) continue;
    if (seen.has(value.name)) duplicates.add(value.name);
    seen.add(value.name);
  }
  return duplicates;
}

function missing(required, actual) {
  return required.filter((value) => !actual.has(value));
}

function closeTo(value, expected, tolerance = 1e-6) {
  return Math.abs(value - expected) <= tolerance;
}

function isIdentityTransform(node) {
  return node.translation.every((value) => closeTo(value, 0))
    && node.rotation.every((value, index) => closeTo(value, index === 3 ? 1 : 0))
    && node.scale.every((value) => closeTo(value, 1));
}

function hasFiniteTransform(node) {
  return [...node.translation, ...node.rotation, ...node.scale].every(Number.isFinite);
}

function globToRegExp(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replaceAll('*', '.*').replaceAll('?', '.')}$`);
}

export function quarantineMatch(filePath, registry) {
  const filename = basename(filePath);
  return registry.entries.find((entry) => globToRegExp(entry.pattern).test(filename)) ?? null;
}

export function evaluateAvatarSnapshot(snapshot, contract, quarantine = null) {
  const findings = [];
  const nodeNames = names(snapshot.nodes);
  const meshNames = names(snapshot.meshes);
  const animationNames = names(snapshot.animations);

  for (const extension of snapshot.extensionsUsed ?? []) {
    if (!(contract.allowedExtensions ?? []).includes(extension)) {
      findings.push(finding('error', 'extension.unsupported', `glTF extension ${extension} is not allowed by this validation profile.`, extension));
    }
  }

  if (snapshot.sceneCount !== 1 || !snapshot.hasDefaultScene) {
    findings.push(finding('error', 'scene.count', `Expected exactly one default scene; found ${snapshot.sceneCount} scenes and default=${snapshot.hasDefaultScene}.`));
  }
  for (const [kind, values] of [
    ['node', snapshot.nodes], ['mesh', snapshot.meshes], ['skin', snapshot.skins],
    ['animation', snapshot.animations], ['material', snapshot.materials], ['texture', snapshot.textures],
  ]) {
    for (const [index, value] of values.entries()) {
      if (!value.name) findings.push(finding('error', `${kind}.name_missing`, `Every ${kind} requires a non-empty unique name.`, `${kind}[${index}]`));
    }
    for (const name of duplicateNames(values)) {
      findings.push(finding('error', `${kind}.duplicate_name`, `Duplicate ${kind} name ${name} is ambiguous.`, name));
    }
  }
  for (const [kind, values] of Object.entries(snapshot.unusedResources ?? {})) {
    for (const name of values) {
      findings.push(finding('error', 'scene.unused_resource', `Unused ${kind} resource ${name} is forbidden in a production GLB.`, name));
    }
  }

  if (quarantine) {
    const assetEntry = quarantineMatch(snapshot.path, quarantine);
    const sourceBlend = typeof snapshot.sceneExtras?.avatarSourceBlend === 'string'
      ? snapshot.sceneExtras.avatarSourceBlend
      : '';
    const sourceEntry = sourceBlend ? quarantineMatch(sourceBlend, quarantine) : null;
    const entry = assetEntry ?? sourceEntry;
    if (entry) {
      findings.push(finding(
        'error',
        'asset.quarantined',
        `Asset is ${entry.status} and may only be used for ${entry.allowedUses.join(', ')}.`,
        assetEntry ? snapshot.path : sourceBlend,
      ));
    }
  }

  if (snapshot.fileBytes > contract.budgets.maxFileBytes) {
    findings.push(finding('error', 'budget.file_bytes', `File is ${snapshot.fileBytes} bytes; maximum is ${contract.budgets.maxFileBytes}.`));
  }

  const sceneExtras = snapshot.sceneExtras ?? {};
  for (const [key, expected] of Object.entries(contract.requiredSceneExtras)) {
    const value = sceneExtras[key];
    const valid = expected === 'non-empty' ? typeof value === 'string' && value.trim() !== '' : value === expected;
    if (!valid) {
      findings.push(finding('error', 'scene.extra_missing', `Scene extra ${key} must be ${expected}.`, `scene.extras.${key}`));
    }
  }

  for (const name of missing(contract.requiredNodes, nodeNames)) {
    findings.push(finding('error', 'node.required_missing', `Required node ${name} is missing.`, name));
  }

  const assetRoot = snapshot.nodes.find((node) => node.name === 'AvatarAsset');
  if (assetRoot && !isIdentityTransform(assetRoot)) {
    findings.push(finding('error', 'node.root_transform', 'AvatarAsset must have an identity transform.', 'AvatarAsset'));
  }
  for (const node of snapshot.nodes) {
    if (!hasFiniteTransform(node)) {
      findings.push(finding('error', 'node.nonfinite_transform', `Node ${node.name} has a non-finite transform.`, node.name));
    }
    if (node.scale.some((value) => value < 0)) {
      findings.push(finding('error', 'node.negative_scale', `Node ${node.name} has negative scale.`, node.name));
    }
    if (node.meshName && !isIdentityTransform(node)) {
      findings.push(finding('error', 'node.mesh_transform', `Mesh-bearing node ${node.name} must have an identity transform.`, node.name));
    }
  }

  if (snapshot.skins.length !== 1) {
    findings.push(finding('error', 'skin.count', `Expected exactly one canonical skin; found ${snapshot.skins.length}.`));
  }
  const skin = snapshot.skins[0];
  if (skin) {
    const jointNames = new Set(skin.joints);
    if (jointNames.size !== skin.joints.length || skin.joints.some((name) => !name)) {
      findings.push(finding('error', 'skin.joint_name', 'Every skin joint requires a non-empty unique name.', skin.name));
    }
    if (skin.joints.length < contract.minimumJointCount) {
      findings.push(finding('error', 'skin.joint_count', `Skin has ${skin.joints.length} joints; minimum is ${contract.minimumJointCount}.`));
    }
    for (const name of missing(contract.requiredJoints, jointNames)) {
      findings.push(finding('error', 'skin.joint_missing', `Required joint ${name} is missing.`, name));
    }
    if (skin.inverseBindCount !== skin.joints.length) {
      findings.push(finding('error', 'skin.inverse_bind_count', `Skin has ${skin.joints.length} joints but ${skin.inverseBindCount} inverse-bind matrices.`));
    }
  }

  for (const name of missing(contract.requiredAnimations, animationNames)) {
    findings.push(finding('error', 'animation.required_missing', `Required animation ${name} is missing.`, name));
  }
  for (const animation of snapshot.animations) {
    if (animation.channels <= 0 || animation.samplers <= 0) {
      findings.push(finding('error', 'animation.empty', `Animation ${animation.name} has no executable channels and samplers.`, animation.name));
    }
  }

  if (!meshNames.has('AvatarBody')) {
    const bodyNode = snapshot.nodes.find((node) => node.name === 'AvatarBody');
    if (!bodyNode?.meshName) {
      findings.push(finding('error', 'body.mesh_missing', 'AvatarBody must reference a body mesh.', 'AvatarBody'));
    }
  }

  let triangles = 0;
  let drawCalls = 0;
  for (const mesh of snapshot.meshes) {
    if (mesh.primitives.length === 0) {
      findings.push(finding('error', 'mesh.empty', `Mesh ${mesh.name} contains no primitives.`, mesh.name));
    }
    for (const [primitiveIndex, primitive] of mesh.primitives.entries()) {
      const location = `${mesh.name}.primitive[${primitiveIndex}]`;
      triangles += primitive.triangles;
      drawCalls += 1;
      if (primitive.vertexCount <= 0 || primitive.triangles <= 0) {
        findings.push(finding('error', 'primitive.empty', 'Primitive must contain vertices and triangles.', location));
      }
      if (primitive.mode !== 4) {
        findings.push(finding('error', 'primitive.mode', 'Only TRIANGLES primitive mode is accepted.', location));
      }
      for (const semantic of contract.requiredPrimitiveAttributes) {
        if (!primitive.attributes.includes(semantic)) {
          findings.push(finding('error', 'primitive.attribute_missing', `Required attribute ${semantic} is missing.`, location));
        }
      }
      if (!primitive.material) {
        findings.push(finding('error', 'primitive.material_missing', 'Every primitive must have a material.', location));
      }
      if (primitive.expectsSkin !== primitive.skinned) {
        findings.push(finding('error', 'skin.binding_mismatch', primitive.expectsSkin
          ? 'A node with a skin references a primitive without both JOINTS_0 and WEIGHTS_0.'
          : 'Primitive has skin attributes but no referencing node is bound to a skin.', location));
      }
      if (primitive.expectsSkin || primitive.skinned) {
        for (const semantic of contract.requiredSkinnedAttributes) {
          if (!primitive.attributes.includes(semantic)) {
            findings.push(finding('error', 'skin.attribute_missing', `Skinned primitive is missing ${semantic}.`, location));
          }
        }
        if (primitive.weights) {
          const tolerance = contract.budgets.weightSumTolerance;
          if (primitive.weights.outOfTolerance > 0
            || primitive.weights.minSum < 1 - tolerance
            || primitive.weights.maxSum > 1 + tolerance) {
            findings.push(finding('error', 'skin.weight_sum', `${primitive.weights.outOfTolerance} vertices have invalid weight sums.`, location));
          }
          if (primitive.weights.nonFinite > 0 || primitive.weights.negative > 0 || primitive.weights.overOne > 0) {
            findings.push(finding('error', 'skin.weight_value', `Weights contain ${primitive.weights.nonFinite} non-finite, ${primitive.weights.negative} negative, and ${primitive.weights.overOne} values over one.`, location));
          }
          if (primitive.weights.maxInfluences > contract.budgets.maxVertexInfluences) {
            findings.push(finding('error', 'skin.max_influences', `Found ${primitive.weights.maxInfluences} influences; maximum is ${contract.budgets.maxVertexInfluences}.`, location));
          }
        }
        if (skin && primitive.maxJointIndex >= skin.joints.length) {
          findings.push(finding('error', 'skin.joint_index', `Joint index ${primitive.maxJointIndex} exceeds skin joint count ${skin.joints.length}.`, location));
        }
      }
    }
  }

  if (triangles > contract.budgets.lod0Triangles) {
    findings.push(finding('error', 'budget.triangles_lod0', `LOD0 has ${triangles} triangles; maximum is ${contract.budgets.lod0Triangles}.`));
  }
  if (drawCalls > contract.budgets.maxDrawCalls) {
    findings.push(finding('error', 'budget.draw_calls', `Asset requires ${drawCalls} primitive draw calls; maximum is ${contract.budgets.maxDrawCalls}.`));
  }

  const bodyMesh = snapshot.meshes.find((mesh) => mesh.name === 'AvatarBody')
    ?? snapshot.meshes.find((mesh) => mesh.nodeNames?.includes('AvatarBody'));
  const bodyTargets = new Set(bodyMesh?.morphTargets ?? []);
  for (const name of missing(contract.requiredMorphTargets, bodyTargets)) {
    findings.push(finding('error', 'morph.required_missing', `AvatarBody morph target ${name} is missing.`, name));
  }

  for (const material of snapshot.materials) {
    const exemptions = new Set(material.exemptions ?? []);
    const unknownExemptions = [...exemptions].filter((name) => !contract.requiredMaterialTextures.includes(name));
    if (unknownExemptions.length > 0) {
      findings.push(finding('error', 'material.exemption_unknown', `Material ${material.name} declares unknown texture exemptions: ${unknownExemptions.join(', ')}.`, material.name));
    }
    if (exemptions.size > 0 && !material.exemptionReason) {
      findings.push(finding('error', 'material.exemption_undocumented', `Material ${material.name} texture exemptions require a non-empty reason.`, material.name));
    }
    for (const textureName of contract.requiredMaterialTextures) {
      if (!material.textures[textureName] && !exemptions.has(textureName)) {
        findings.push(finding('error', 'material.texture_missing', `Material ${material.name} lacks ${textureName}; declare a documented exemption only when physically appropriate.`, material.name));
      }
    }
  }

  const textureBytes = snapshot.textures.reduce((sum, texture) => sum + texture.bytes, 0);
  if (textureBytes > contract.budgets.maxTextureBytes) {
    findings.push(finding('error', 'budget.texture_bytes', `Textures total ${textureBytes} bytes; maximum is ${contract.budgets.maxTextureBytes}.`));
  }
  for (const texture of snapshot.textures) {
    if (!texture.bytes) {
      findings.push(finding('error', 'texture.empty', `Texture ${texture.name} has no embedded image data.`, texture.name));
    }
    if (!contract.allowedTextureMimeTypes.includes(texture.mimeType)) {
      findings.push(finding('error', 'texture.mime_type', `Texture ${texture.name} uses unsupported MIME type ${texture.mimeType ?? 'unknown'}.`, texture.name));
    }
    if (!texture.size || texture.size.length < 2 || texture.size.some((value) => !Number.isFinite(value) || value <= 0)) {
      findings.push(finding('error', 'texture.dimension_unknown', `Texture ${texture.name} dimensions could not be verified.`, texture.name));
    } else if (Math.max(...texture.size) > contract.budgets.maxTextureDimension) {
      findings.push(finding('error', 'texture.dimension', `Texture ${texture.name} is ${texture.size.join('x')}; maximum dimension is ${contract.budgets.maxTextureDimension}.`, texture.name));
    }
  }

  const errors = findings.filter((item) => item.severity === 'error');
  return {
    schemaVersion: 1,
    contract: contract.contract,
    asset: snapshot.path,
    verdict: errors.length === 0 ? 'PASS' : 'FAIL',
    summary: {
      errors: errors.length,
      warnings: findings.filter((item) => item.severity === 'warning').length,
      nodes: snapshot.nodes.length,
      meshes: snapshot.meshes.length,
      skins: snapshot.skins.length,
      joints: skin?.joints.length ?? 0,
      animations: snapshot.animations.length,
      triangles,
      drawCalls,
      textureBytes,
    },
    findings,
    manualGatesStillRequired: [
      'reference identity and likeness',
      'strict T-pose and bind-pose orientation',
      'ground contact, height in meters, and +Z facing',
      'body watertightness and topology flow',
      'UV overlap and texel density',
      'stress-pose deformation and edge ratios',
      'Babylon.js load time, frame rate, and visual rendering',
    ],
  };
}
