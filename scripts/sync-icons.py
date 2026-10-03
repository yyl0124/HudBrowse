"""Use the supplied ICO verbatim; decode it only for PNG consumers. Requires Pillow."""
from pathlib import Path
import shutil
from PIL import Image

root = Path(__file__).resolve().parents[1]
source = root / 'public/bitbug_favicon.ico'
icons = root / 'src-tauri/icons'
# Tauri 1.x decodes the first ICO entry for live windows. This supplied file
# contains a 64px entry; copying it preserves its pixels and directory order.
image = Image.open(source).convert('RGBA')
for name in ('icon', 'logo'):
    shutil.copy2(source, icons / f'{name}.ico')
    image.save(icons / f'{name}.png')
print('Copied supplied ICO unchanged and decoded PNG assets without resizing')
