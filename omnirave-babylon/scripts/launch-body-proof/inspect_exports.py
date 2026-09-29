"""Inspect the actual GLB boundary, including exported skin weights and motion."""
from pathlib import Path
import argparse
import hashlib
import json
import math
import struct

OUT = Path(__file__).resolve().parents[2] / 'assets-src/avatars/launch-body-proof'


def inspect(path):
    raw = path.read_bytes()
    magic, version, length = struct.unpack_from('<4sII', raw)
    assert magic == b'glTF' and version == 2 and length == len(raw)
    size, kind = struct.unpack_from('<II', raw, 12)
    assert kind == 0x4E4F534A
    doc = json.loads(raw[20:20 + size])
    binary_size, kind = struct.unpack_from('<II', raw, 20 + size)
    assert kind == 0x004E4942
    binary = raw[28 + size:28 + size + binary_size]
    assert len(binary) == binary_size
    assert all('uri' not in b for b in doc['buffers'])

    def values(index):
        a = doc['accessors'][index]
        assert 'sparse' not in a
        view = doc['bufferViews'][a['bufferView']]
        width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a['type']]
        code = {5121: 'B', 5123: 'H', 5125: 'I', 5126: 'f'}[a['componentType']]
        fmt = '<' + code * width
        element_size = struct.calcsize(fmt)
        stride = view.get('byteStride', element_size)
        offset = view.get('byteOffset', 0) + a.get('byteOffset', 0)
        assert a['count'] > 0
        assert offset + stride * (a['count'] - 1) + element_size <= view.get('byteOffset', 0) + view['byteLength']
        data = [struct.unpack_from(fmt, binary, offset + i * stride) for i in range(a['count'])]
        assert all(math.isfinite(x) for row in data for x in row)
        return data

    assert len(doc['skins']) == 1 and len(doc['skins'][0]['joints']) == 56
    assert len(values(doc['skins'][0]['inverseBindMatrices'])) == 56
    triangles = 0
    max_weight_error = 0
    for node in doc['nodes']:
        if 'mesh' in node:
            assert node.get('skin') == 0
    for mesh in doc['meshes']:
        for primitive in mesh['primitives']:
            assert primitive.get('mode', 4) == 4
            a = primitive['attributes']
            assert {'POSITION', 'NORMAL', 'JOINTS_0', 'WEIGHTS_0'} <= a.keys()
            positions, normals, joints, weights = [values(a[k]) for k in ['POSITION', 'NORMAL', 'JOINTS_0', 'WEIGHTS_0']]
            assert len(positions) == len(normals) == len(joints) == len(weights)
            assert all(0 <= x < 56 for row in joints for x in row)
            assert all(0 <= x <= 1 for row in weights for x in row)
            max_weight_error = max(max_weight_error, max(abs(sum(row) - 1) for row in weights))
            indices = values(primitive['indices'])
            assert len(indices) % 3 == 0 and all(i[0] < len(positions) for i in indices)
            triangles += len(indices) // 3
    assert max_weight_error < 1e-5
    assert len(doc['animations']) == 1
    animation = doc['animations'][0]
    assert animation['name'] == 'Body joint test'
    durations = []
    for sampler in animation['samplers']:
        times = [row[0] for row in values(sampler['input'])]
        assert all(b > a for a, b in zip(times, times[1:]))
        assert len(values(sampler['output'])) == len(times)
        durations.append(times[-1] - times[0])
    assert abs(max(durations) - 5) < 1e-5
    return dict(character=path.name.split('-')[0], bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest(),
                all_exported_triangles=triangles, mesh_count=len(doc['meshes']), bones=56,
                max_skin_weight_sum_error=max_weight_error, animation=animation['name'],
                duration_seconds=max(durations), scope='structural export validation; visual, gameplay and device acceptance remain pending')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--version', choices=['body02', 'body03', 'body04', 'body05', 'top01', 'outfit01', 'outfit02', 'outfit03', 'outfit04'], default='body02')
    version = parser.parse_args().version
    result = inspect(OUT / f'male-{version}.glb') if version.startswith('outfit') else [inspect(OUT / f'{sex}-{version}.glb') for sex in ['male', 'female']]
    report_name = f'male-{version}-export-check.json' if version.startswith('outfit') else 'export-check.json' if version == 'body02' else f'{version}-export-check.json'
    (OUT / report_name).write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))
