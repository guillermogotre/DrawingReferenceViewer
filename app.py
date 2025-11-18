import os
import random
import json
import shutil
from flask import Flask, render_template, jsonify, send_from_directory, request
from flask_caching import Cache
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

app = Flask(__name__)

# --- CONFIGURATION ---
# Base directory for images. Must be configured in a .env file
BASE_DIR = os.getenv("BASE_DIR")

if not BASE_DIR:
    raise ValueError("The BASE_DIR environment variable is not configured. Create a .env file with BASE_DIR=/path/to/your/images")

if not os.path.exists(BASE_DIR):
    print(f"WARNING: The directory {BASE_DIR} does not exist.")

FAV_FILE = "favorites.json"
VALID_EXTENSIONS = ('.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp')

# --- CACHE CONFIGURATION ---
# We use FileSystemCache so the cache is shared among Gunicorn workers
# and survives quick restarts.
cache = Cache(app, config={
    'CACHE_TYPE': 'FileSystemCache',
    'CACHE_DIR': os.path.join(os.getcwd(), 'flask_cache'), # Local folder to store cache
    'CACHE_DEFAULT_TIMEOUT': 86400, # 24 hours by default (or until you press Refresh)
    'CACHE_THRESHOLD': 1000 # Maximum number of files in cache
})

# --- CACHED UTILITIES ---

@cache.cached(key_prefix='folder_structure')
def get_folder_structure():
    """
    Scans root folders ignoring hidden ones (starting with a dot).
    """
    try:
        folders = [
            f for f in os.listdir(BASE_DIR) 
            if os.path.isdir(os.path.join(BASE_DIR, f)) 
            and not f.startswith('.')  # <--- FILTER
        ]
        return sorted(folders)
    except FileNotFoundError:
        return []

@cache.memoize(timeout=86400)
def get_all_images_in_subdir(subdir_name):
    images = []
    target_path = os.path.join(BASE_DIR, subdir_name)
    
    if not os.path.exists(target_path):
        return []

    for root, dirs, files in os.walk(target_path):
        # Modify 'dirs' in-place so os.walk does not enter hidden folders
        dirs[:] = [d for d in dirs if not d.startswith('.')]  # <--- FILTER
        
        for file in files:
            if file.lower().endswith(VALID_EXTENSIONS) and not file.startswith('.'):
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, BASE_DIR)
                images.append(rel_path)
    return images

def get_siblings_context(rel_path):
    """
    This is fast (single directory), not critical to cache,
    but helps with instant navigation.
    """
    full_path = os.path.join(BASE_DIR, rel_path)
    parent_dir = os.path.dirname(full_path)
    
    try:
        files = sorted([
            f for f in os.listdir(parent_dir) 
            if f.lower().endswith(VALID_EXTENSIONS)
        ])
    except FileNotFoundError:
        return [], 0

    rel_parent = os.path.relpath(parent_dir, BASE_DIR)
    
    siblings_rel_paths = []
    current_index = 0
    current_filename = os.path.basename(full_path)

    for i, f in enumerate(files):
        path = f if rel_parent == '.' else os.path.join(rel_parent, f)
        siblings_rel_paths.append(path)
        if f == current_filename:
            current_index = i
            
    return siblings_rel_paths, current_index

# --- FAVORITES MANAGEMENT ---

def load_favorites():
    if not os.path.exists(FAV_FILE): return []
    try:
        with open(FAV_FILE, 'r') as f: return json.load(f)
    except: return []

def save_favorites(fav_list):
    with open(FAV_FILE, 'w') as f: json.dump(fav_list, f, indent=4)

# --- ROUTES ---

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/media/<path:filename>')
def serve_image(filename):
    return send_from_directory(BASE_DIR, filename)

@app.route('/api/structure')
def api_structure():
    return jsonify(get_folder_structure())

@app.route('/api/random', methods=['GET', 'POST'])
def api_random():
    if request.method == 'POST':
        allowed_folders = request.json.get('folders', [])
    else:
        allowed_folders = request.args.getlist('folders[]')
        
    if not allowed_folders:
        return jsonify({"error": "No folders selected"}), 400

    # Try up to 3 times to find a non-empty folder
    for _ in range(3):
        chosen_folder_root = random.choice(allowed_folders)
        # THIS CALL IS NOW INSTANT IF DONE BEFORE
        images = get_all_images_in_subdir(chosen_folder_root)
        
        if images:
            chosen_image_rel = random.choice(images)
            siblings, index = get_siblings_context(chosen_image_rel)
            return jsonify({
                "path": chosen_image_rel,
                "folder_root": chosen_folder_root,
                "filename": os.path.basename(chosen_image_rel),
                "siblings": siblings,
                "index": index
            })
            
    return jsonify({"error": "Selected folders are empty"}), 404

@app.route('/api/context')
def api_context():
    target_path = request.args.get('path')
    if not target_path: return jsonify({"error": "No path provided"}), 400
    full_path = os.path.join(BASE_DIR, target_path)
    if not os.path.exists(full_path): return jsonify({"error": "File not found"}), 404

    siblings, index = get_siblings_context(target_path)
    folder_root = target_path.split(os.sep)[0]

    return jsonify({
        "path": target_path,
        "folder_root": folder_root,
        "filename": os.path.basename(target_path),
        "siblings": siblings,
        "index": index
    })

@app.route('/api/favorites', methods=['GET', 'POST'])
def handle_favorites():
    if request.method == 'POST':
        data = request.json
        path = data.get('path')
        if not path: return jsonify({"error": "No path"}), 400
        favs = load_favorites()
        if path in favs: favs.remove(path)
        else: favs.append(path)
        save_favorites(favs)
        return jsonify({"favorites": favs})
    else:
        favs = load_favorites()
        return jsonify(favs)

# --- NEW ROUTE TO CLEAR CACHE ---
@app.route('/api/cache/clear', methods=['POST'])
def clear_cache():
    """Clears the entire cache to scan for new files"""
    cache.clear()
    return jsonify({"status": "Cache cleared", "message": "Libraries rescanned"})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)