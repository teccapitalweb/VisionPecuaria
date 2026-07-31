"""Genera los iconos PWA desde el isotipo oficial, sin reinterpretarlo."""

from pathlib import Path
from PIL import Image, ImageChops, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "brand-toro.png"
CREAM = (245, 239, 228, 255)


def largest_component(mask: Image.Image) -> Image.Image:
    width, height = mask.size
    pixels = mask.load()
    seen: set[tuple[int, int]] = set()
    largest: list[tuple[int, int]] = []
    for y in range(height):
        for x in range(width):
            if pixels[x, y] == 0 or (x, y) in seen:
                continue
            component: list[tuple[int, int]] = []
            stack = [(x, y)]
            seen.add((x, y))
            while stack:
                px, py = stack.pop()
                component.append((px, py))
                for nx, ny in ((px + 1, py), (px - 1, py), (px, py + 1), (px, py - 1)):
                    if 0 <= nx < width and 0 <= ny < height and pixels[nx, ny] and (nx, ny) not in seen:
                        seen.add((nx, ny))
                        stack.append((nx, ny))
            if len(component) > len(largest):
                largest = component
    result = Image.new("L", mask.size, 0)
    result_pixels = result.load()
    for x, y in largest:
        result_pixels[x, y] = 255
    return result


def isolated_bull() -> Image.Image:
    source = Image.open(SOURCE).convert("RGBA")
    # El archivo maestro incluye dos trazos finos del contenedor horizontal del
    # logotipo. Una apertura morfológica elimina esos trazos y conserva el
    # isotipo sólido del toro sin redibujarlo ni cambiar sus colores.
    alpha = source.getchannel("A")
    solid = alpha.point(lambda value: 255 if value >= 20 else 0)
    solid = solid.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5))
    solid = largest_component(solid)
    source.putalpha(ImageChops.multiply(alpha, solid))
    box = source.getbbox()
    return source.crop(box) if box else source


def build(size: int, mark_ratio: float, destination: str) -> None:
    source = isolated_bull()
    mark_size = round(size * mark_ratio)
    source.thumbnail((mark_size, mark_size), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), CREAM)
    offset = ((size - source.width) // 2, (size - source.height) // 2)
    canvas.alpha_composite(source, offset)
    canvas.convert("RGB").save(ROOT / destination, "PNG", optimize=True)


build(192, 0.74, "pwa-192.png")
build(512, 0.74, "pwa-512.png")
# Android puede recortar el icono a círculo, squircle u otra forma. El 60 %
# mantiene cuernos, hocico y curva inferior dentro de la zona segura maskable.
build(512, 0.60, "pwa-maskable-512.png")
build(180, 0.70, "apple-touch-icon.png")
