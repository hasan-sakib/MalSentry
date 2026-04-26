
import os
import io
import secrets
import base64
from datetime import datetime
from flask import Flask, redirect, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename

# Import conversion functions from conversion.py
from utils.conversion import convert_file_to_image

# Initialize Flask app FIRST
app = Flask(__name__)

# Configuration
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB
app.config['UPLOAD_FOLDER'] = 'temp'
app.config['TEMP_UPLOAD_FOLDER'] = 'static/uploads'
app.config['SECRET_KEY'] = secrets.token_hex(32)

# Create directories
for folder in [app.config['UPLOAD_FOLDER'], app.config['TEMP_UPLOAD_FOLDER']]:
    os.makedirs(folder, exist_ok=True)

print("\n" + "="*50)
print("🔍 Loading Malware Detection System...")
print("="*50)

# Initialize model variables
MODEL_TYPE = "SIMULATION"
classifier = None
model_loaded = False

# Model path: place notebook export `final_model.pth` under models/, or set MALWARE_MODEL_NAME
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(
    BASE_DIR,
    "models",
    os.environ.get("MALWARE_MODEL_NAME", "/Users/sakib/Projects/Malware_Detect/models/full_unfrozen_backbone.pth"),
)

print(f"📁 Base directory: {BASE_DIR}")
print(f"🔍 Model path: {MODEL_PATH}")
print(f"📄 Model file exists: {os.path.exists(MODEL_PATH)}")

if os.path.exists(MODEL_PATH):
    try:
        import torch
        from PIL import Image
        from torchvision import transforms

        from utils.malware_model import MalwareClassifier, bind_predict, load_classifier_state

        print("✅ PyTorch imported successfully")

        device = torch.device(
            "cuda" if torch.cuda.is_available() else
            "mps" if hasattr(torch.backends, "mps") and torch.backends.mps.is_available() else
            "cpu"
        )
        print(f"⚙️  Using device: {device}")

        classifier = MalwareClassifier(pretrained_path=None)
        print(f"🚀 Loading weights from: {MODEL_PATH}")
        print(f"📏 Model file size: {os.path.getsize(MODEL_PATH) / (1024 * 1024):.2f} MB")

        try:
            checkpoint = torch.load(MODEL_PATH, map_location=device, weights_only=False)
        except TypeError:
            checkpoint = torch.load(MODEL_PATH, map_location=device)
        print("✅ Checkpoint loaded successfully")
        if isinstance(checkpoint, dict):
            keys = list(checkpoint.keys())
            preview = keys[:12]
            print(f"📋 Checkpoint keys (first {len(preview)}): {preview}{'...' if len(keys) > 12 else ''}")

        load_classifier_state(classifier, checkpoint)
        classifier.to(device)
        classifier.eval()

        transform = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ])
        classifier.device = device
        classifier.transform = transform
        classifier.class_names = ["Benign", "Malicious"]
        bind_predict(classifier, device, transform)

        print("🧪 Testing model with dummy image...")
        dummy_image = Image.new("RGB", (224, 224), color="gray")
        test_result = classifier.predict(dummy_image)
        print(f"✅ Model test result: {test_result['class']} ({test_result['confidence']}%)")

        MODEL_TYPE = "REAL"
        model_loaded = True
        print("🎉 REAL MODEL LOADED SUCCESSFULLY!")

    except ImportError as e:
        print(f"❌ PyTorch not available: {e}")
        MODEL_TYPE = "SIMULATION"
        model_loaded = False
    except Exception as e:
        print(f"❌ Error loading model weights: {str(e)}")
        import traceback
        traceback.print_exc()
        MODEL_TYPE = "SIMULATION"
        model_loaded = False
else:
    print(f"❌ Model file not found at: {MODEL_PATH}")
    print("   Export final_model.pth from malware-f30-u20-70.ipynb into models/")
    print("   Or set env MALWARE_MODEL_NAME to your .pth filename.")
    MODEL_TYPE = "SIMULATION"
    model_loaded = False

# If no model loaded, use simulation
if not model_loaded:
    class SimulationModel:
        def __init__(self):
            self.class_names = ['Benign', 'Malicious']
            print("⚠️  USING SIMULATION MODE - NO REAL PREDICTIONS")
            print("⚠️  To use real model, ensure model file is properly structured")
        
        def predict(self, image):
            """Return error message for simulation mode."""
            return {
                'error': 'REAL MODEL NOT LOADED. Running in simulation mode.',
                'class': 'SIMULATION MODE',
                'confidence': 0,
                'probabilities': {
                    'Benign': 50,
                    'Malicious': 50
                },
                'simulation': True,
                'model_available': False
            }
    
    classifier = SimulationModel()

print(f"📊 Model type: {MODEL_TYPE}")
print(f"✅ Model loaded: {model_loaded}")
print("="*50)

# Store uploaded files data
uploaded_files = {}

SPA_ROOT = os.path.join(BASE_DIR, 'static', 'spa')
SPA_INDEX = os.path.join(SPA_ROOT, 'index.html')
if not os.path.isfile(SPA_INDEX):
    print(f"⚠️  React UI not built: missing {SPA_INDEX}")
    print("   Run: cd frontend && npm install && npm run build")

# Routes
@app.route('/')
def index():
    """Serve React SPA (Vite build in static/spa)."""
    if not os.path.isfile(SPA_INDEX):
        return (
            "<!doctype html><html><head><meta charset=utf-8><title>Setup required</title></head>"
            "<body style='font-family:system-ui;max-width:40rem;margin:2rem'>"
            "<h1>Frontend build missing</h1>"
            "<p>The React app is not in <code>static/spa/</code>. From the project root run:</p>"
            "<pre style='background:#f4f4f4;padding:1rem'>cd frontend\nnpm install\nnpm run build</pre>"
            "<p>Then restart <code>python app.py</code>. If you still see errors, ensure you saved "
            "<code>app.py</code> (it must serve the SPA, not <code>templates/index.html</code>).</p>"
            "</body></html>",
            503,
            {'Content-Type': 'text/html; charset=utf-8'},
        )
    return send_from_directory(SPA_ROOT, 'index.html')


@app.route('/favicon.ico')
def favicon_ico():
    return redirect('/favicon.svg', code=302)


@app.route('/assets/<path:filename>')
def spa_assets(filename):
    """Vite-built JS/CSS under static/spa/assets."""
    return send_from_directory(os.path.join(SPA_ROOT, 'assets'), filename)


@app.route('/favicon.svg')
def spa_favicon():
    return send_from_directory(SPA_ROOT, 'favicon.svg', mimetype='image/svg+xml')

@app.route('/upload', methods=['POST'])
def upload_file():
    """Handle file upload for binary visualization only."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    try:
        # Read file bytes
        file_bytes = file.read()
        filename = secure_filename(file.filename)
        
        # Validate file size
        if len(file_bytes) > app.config['MAX_CONTENT_LENGTH']:
            return jsonify({
                'error': f'File too large. Max size is {app.config["MAX_CONTENT_LENGTH"] // (1024*1024)}MB'
            }), 400
        
        # Convert file to image USING THE CONVERSION.PY MODULE
        img_bytes, pil_image = convert_file_to_image(file_bytes, filename)
        
        # Generate unique filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_name = os.path.splitext(filename)[0][:50]
        img_filename = f"{timestamp}_{safe_name}.png"
        img_path = os.path.join(app.config['TEMP_UPLOAD_FOLDER'], img_filename)
        
        # Save image
        pil_image.save(img_path)
        
        # Convert to base64 for frontend
        buffered = io.BytesIO()
        pil_image.save(buffered, format="PNG")
        img_base64 = base64.b64encode(buffered.getvalue()).decode('utf-8')
        
        # Store file data for later detection
        file_id = secrets.token_hex(16)
        uploaded_files[file_id] = {
            'filename': filename,
            'file_size': len(file_bytes),
            'image_path': img_path,
            'pil_image': pil_image,
            'timestamp': timestamp
        }
        
        # Prepare response
        response = {
            'success': True,
            'file_id': file_id,
            'filename': filename,
            'image_url': f'/static/uploads/{img_filename}',
            'image_base64': f'data:image/png;base64,{img_base64}',
            'file_size': len(file_bytes),
            'timestamp': timestamp,
            'model_type': MODEL_TYPE,
            'model_loaded': model_loaded,
            'message': 'File uploaded successfully. Click "Detect Malware" to analyze.'
        }
        
        return jsonify(response)
        
    except Exception as e:
        import traceback
        print(f"Error processing file: {e}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/detect', methods=['POST'])
def detect_malware():
    """Handle malware detection on uploaded file."""
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        file_id = data.get('file_id')
        if not file_id or file_id not in uploaded_files:
            return jsonify({'error': 'File not found. Please upload again.'}), 404
        
        file_data = uploaded_files[file_id]
        pil_image = file_data['pil_image']
        
        # Make prediction
        prediction = classifier.predict(pil_image)
        
        # Check if there's an error in prediction (model not loaded)
        if 'error' in prediction:
            return jsonify({
                'success': False,
                'error': prediction['error'],
                'model_loaded': model_loaded
            }), 503
        
        # Prepare response - FIXED: Ensure all values are JSON serializable
        response = {
            'success': True,
            'file_id': file_id,
            'filename': file_data['filename'],
            'prediction': prediction,
            'detection_time': datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            'model_type': MODEL_TYPE,
            'model_loaded': model_loaded
        }
        
        return jsonify(response)
        
    except Exception as e:
        import traceback
        print(f"Error during malware detection: {e}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/static/uploads/<filename>')
def uploaded_file(filename):
    """Serve uploaded images."""
    return send_from_directory(app.config['TEMP_UPLOAD_FOLDER'], filename)

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({
        'status': 'healthy',
        'model_type': MODEL_TYPE,
        'model_loaded': model_loaded,
        'max_upload_size_mb': app.config['MAX_CONTENT_LENGTH'] // (1024 * 1024)
    })

# Debug endpoint
@app.route('/debug', methods=['GET'])
def debug_info():
    """Debug endpoint to check uploaded files."""
    return jsonify({
        'uploaded_files_count': len(uploaded_files),
        'uploaded_files': list(uploaded_files.keys()),
        'model_loaded': model_loaded,
        'model_type': MODEL_TYPE
    })

if __name__ == '__main__':
    print("\n" + "="*50)
    print("🚀 Malware Detection Web Application")
    print("="*50)
    print(f"Model Status: {'✅ LOADED' if model_loaded else '❌ NOT LOADED'}")
    print(f"Model Type: {MODEL_TYPE}")
    print(f"Model file env: MALWARE_MODEL_NAME (default final_model.pth) → models/")
    
    # Use a different port to avoid conflict
    port = 5002  # Changed from 5001 to 5002
    print(f"Running on: http://localhost:{port}")
    print("="*50 + "\n")
    
    app.run(host='0.0.0.0', port=port, debug=True, use_reloader=False)
