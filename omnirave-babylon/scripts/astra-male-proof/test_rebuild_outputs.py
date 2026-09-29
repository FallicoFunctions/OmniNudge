"""Exercise CLI publication with a small writer double; full Blender parity is separate."""
import importlib.util
import os
from pathlib import Path
import sys
import tempfile
import threading
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace as NS
import unittest
from unittest.mock import patch

SCRIPT = Path(os.environ.get('REBUILD_SCRIPT', Path(__file__).with_name('rebuild_current.py')))

class OutputTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.output = self.root / 'model.blend'
        self.render = self.root / 'portrait.png'
        self.before_save = lambda: None
        self.render_fails = False
        self.save_cancelled = False
        self.scene = NS(cycles=NS(samples=0), render=NS(filepath='', use_file_extension=True, image_settings=NS(file_format='PNG')))
        def save(filepath, **kwargs):
            self.before_save()
            if self.save_cancelled:
                return {'CANCELLED'}
            Path(filepath).write_bytes(b'BLENDER-complete')
            return {'FINISHED'}
        def render(**kwargs):
            if self.render_fails:
                raise RuntimeError('controlled renderer failure')
            p = Path(self.scene.render.filepath)
            if self.scene.render.use_file_extension and p.suffix != '.png':
                p = Path(str(p) + '.png')
            p.write_bytes(b'PNG-complete')
            return {'FINISHED'}
        bpy = NS(context=NS(scene=self.scene, preferences=NS(filepaths=NS(save_version=0)), view_layer=NS(update=lambda:None)), data=NS(objects=[]), ops=NS(wm=NS(open_mainfile=lambda **k:None, save_as_mainfile=save), render=NS(render=render)))
        modules = {'bpy':bpy, 'mathutils':NS(Vector=None), 'mathutils.bvhtree':NS(BVHTree=None)}
        with patch.dict(sys.modules, modules):
            spec=importlib.util.spec_from_file_location('rebuild_under_test', SCRIPT)
            self.module=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.module)
        for name in ['grow_undercoat','prepare_undercoat','build_curls','refine_face']:
            setattr(self.module,name,lambda:None)
    def run_cli(self, render=None):
        argv=['blender','--','--output',str(self.output)]
        if render is not None:argv+=['--render',str(render)]
        with patch.object(sys,'argv',argv):self.module.main()
    def test_model_only(self):
        self.run_cli();self.assertEqual(self.output.read_bytes(),b'BLENDER-complete');self.assertEqual(list(self.root.iterdir()),[self.output])
    def test_model_and_render(self):
        self.run_cli(self.render);self.assertEqual(self.output.read_bytes(),b'BLENDER-complete');self.assertEqual(self.render.read_bytes(),b'PNG-complete');self.assertEqual(len(list(self.root.iterdir())),2)
    def test_existing_output(self):
        self.output.write_bytes(b'original')
        with self.assertRaises(FileExistsError):self.run_cli()
        self.assertEqual(self.output.read_bytes(),b'original')
    def test_existing_render(self):
        self.render.write_bytes(b'original')
        with self.assertRaises(FileExistsError):self.run_cli(self.render)
        self.assertFalse(self.output.exists());self.assertEqual(self.render.read_bytes(),b'original')
    def test_render_extension(self):
        self.render.write_bytes(b'original')
        with self.assertRaises(ValueError):self.run_cli(self.render.with_suffix(''))
        self.assertEqual(self.render.read_bytes(),b'original');self.assertFalse(self.output.exists())
    def test_late_output_collision(self):
        self.before_save=lambda:self.output.write_bytes(b'other writer')
        with self.assertRaises(FileExistsError):self.run_cli()
        self.assertEqual(self.output.read_bytes(),b'other writer')
    def test_render_failure_leaves_no_output(self):
        self.render_fails=True
        with self.assertRaisesRegex(RuntimeError,'controlled renderer failure'):self.run_cli(self.render)
        self.assertEqual(list(self.root.iterdir()),[])
    def test_cancelled_save_leaves_no_output(self):
        self.save_cancelled=True
        with self.assertRaises(RuntimeError):self.run_cli()
        self.assertEqual(list(self.root.iterdir()),[])
    def test_output_extension(self):
        self.output=self.output.with_suffix('')
        with self.assertRaises(ValueError):self.run_cli()
        self.assertEqual(list(self.root.iterdir()),[])
    def test_dangling_symlink(self):
        self.output.symlink_to(self.root/'absent.blend')
        with self.assertRaises(FileExistsError):self.run_cli()
        self.assertTrue(self.output.is_symlink());self.assertFalse(self.output.exists())
    def test_second_publication_collision_rolls_back_first(self):
        self.before_save=lambda:self.render.write_bytes(b'other writer')
        with self.assertRaises(FileExistsError):self.run_cli(self.render)
        self.assertFalse(self.output.exists());self.assertEqual(self.render.read_bytes(),b'other writer')
        self.assertEqual(list(self.root.iterdir()),[self.render])
    def test_concurrent_publication(self):
        barrier=threading.Barrier(8)
        def writer(i):
            try:
                with self.module.staged_outputs([self.output]) as staged:
                    staged[self.output].write_bytes(str(i).encode())
                    barrier.wait(timeout=10)
                return i
            except FileExistsError:return None
        with ThreadPoolExecutor(max_workers=8) as pool:results=list(pool.map(writer,range(8)))
        winners=[r for r in results if r is not None]
        self.assertEqual(len(winners),1);self.assertEqual(self.output.read_text(),str(winners[0]))
        self.assertEqual(list(self.root.iterdir()),[self.output])

if __name__=='__main__':unittest.main()
