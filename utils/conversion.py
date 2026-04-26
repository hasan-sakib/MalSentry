import os
import math
import numpy as np
from PIL import Image
import io

def get_nataraj_width(file_size_bytes):
    """Determine image width based on file size."""
    KB = 1024
    if file_size_bytes < 10 * KB:
        return 32
    elif file_size_bytes < 30 * KB:
        return 64
    elif file_size_bytes < 60 * KB:
        return 128
    elif file_size_bytes < 100 * KB:
        return 256
    elif file_size_bytes < 200 * KB:
        return 384
    elif file_size_bytes < 500 * KB:
        return 512
    elif file_size_bytes < 1000 * KB:
        return 768
    else:
        return 1024

def bytes_to_image(raw_bytes, width):
    """Convert binary bytes to grayscale image array."""
    data = np.frombuffer(raw_bytes, dtype=np.uint8)
    height = math.ceil(len(data) / width)
    padded = np.pad(data, (0, height * width - len(data)), 'constant')
    return padded.reshape((height, width))

def convert_file_to_image(file_bytes, filename):
    """Convert uploaded file bytes to grayscale PNG image."""
    width = get_nataraj_width(len(file_bytes))
    arr = bytes_to_image(file_bytes, width)
    
    # Convert to PIL Image
    img = Image.fromarray(arr.astype(np.uint8), mode="L")
    
    # Convert to RGB (3 channels) for model input
    img_rgb = img.convert("RGB")
    
    # Save to bytes
    img_bytes = io.BytesIO()
    img_rgb.save(img_bytes, format='PNG')
    img_bytes.seek(0)
    
    return img_bytes, img_rgb