"""
Backend for the Drawing Reference Viewer application.
Handles image serving, caching, and favorites management.
"""
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
# We use FileSystemCache to persist cache data across server restarts and
# share it among Gunicorn workers (if used in production).
# This is crucial for performance when scanning large image directories.
cache = Cache(app, config={
    'CACHE_TYPE': 'FileSystemCache',
    'CACHE_DIR': os.path.join(os.getcwd(), 'flask_cache'), # Local folder to store cache
    'CACHE_DEFAULT_TIMEOUT': 86400, # 24 hours by default (or until user manually refreshes)
    'CACHE_THRESHOLD': 1000 # Maximum number of items in cache
})

# --- CACHED UTILITIES ---

@cache.cached(key_prefix='folder_structure_v2')
def get_folder_structure():
    """
    Scans root folders recursively to build a tree structure.
    Returns a list of dicts: { "name": "...", "path": "...", "children": [...] }
    """
    def scan_dir(dir_path, rel_path_prefix=''):
        try:
            # Use follow_symlinks=False to avoid loops and broken links
            entries = sorted([
                e for e in os.scandir(dir_path)
                if e.is_dir(follow_symlinks=False) and not e.name.startswith('.')
            ], key=lambda e: e.name.lower())
        except OSError:
            return []

        tree = []
        for entry in entries:
            # Current relative path from BASE_DIR
            current_rel_path = os.path.join(rel_path_prefix, entry.name)
            
            node = {
                "name": entry.name,
                "path": current_rel_path,
                "children": scan_dir(entry.path, current_rel_path)
            }
            tree.append(node)
        return tree

    return scan_dir(BASE_DIR)

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
    """
    Loads the list of favorite image paths from the JSON file.
    Returns an empty list if the file doesn't exist or is invalid.
    """
    if not os.path.exists(FAV_FILE): return []
    try:
        with open(FAV_FILE, 'r') as f: return json.load(f)
    except: return []

def save_favorites(fav_list):
    """
    Saves the list of favorite image paths to the JSON file.
    """
    with open(FAV_FILE, 'w') as f: json.dump(fav_list, f, indent=4)

# --- ROUTES ---

# --- ROUTES ---

@app.route('/')
def index():
    """Serves the main single-page application."""
    return render_template('index.html')

@app.route('/media/<path:filename>')
def serve_image(filename):
    """
    Serves images from the configured BASE_DIR.
    This route is essential because images are outside the static folder.
    """
    return send_from_directory(BASE_DIR, filename)

@app.route('/api/structure')
def api_structure():
    """
    API Endpoint: Returns the folder structure of the image library.
    Used by the frontend to populate the folder selection menu.
    """
    return jsonify(get_folder_structure())

@app.route('/api/random', methods=['GET', 'POST'])
def api_random():
    """
    API Endpoint: Returns a random image from the selected folders.
    Supports both GET (query params) and POST (JSON body) for folder selection.
    """
    if request.method == 'POST':
        allowed_folders = request.json.get('folders', [])
    else:
        allowed_folders = request.args.getlist('folders[]')
        
    if not allowed_folders:
        return jsonify({"error": "No folders selected"}), 400

    # Try up to 3 times to find a non-empty folder
    # Try up to 3 times to find a non-empty folder to avoid returning 404 immediately
    # if a selected folder happens to be empty.
    for _ in range(3):
        chosen_folder_root = random.choice(allowed_folders)
        # This call is cached, so it's fast on subsequent requests
        images = get_all_images_in_subdir(chosen_folder_root)
        
        if images:
            chosen_image_rel = random.choice(images)
            # Get context (siblings) for navigation (Next/Prev)
            siblings, index = get_siblings_context(chosen_image_rel)
            return jsonify({
                "path": chosen_image_rel, # Relative path for frontend use
                "folder_root": chosen_folder_root,
                "filename": os.path.basename(chosen_image_rel),
                "siblings": siblings, # List of sibling images for navigation
                "index": index # Current index in the sibling list
            })
            
    return jsonify({"error": "Selected folders are empty"}), 404

@app.route('/api/context')
def api_context():
    """
    API Endpoint: Returns context (siblings) for a specific image path.
    Used when loading a specific image (e.g., from favorites) to enable navigation.
    """
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
    """
    API Endpoint: Manages favorite images.
    GET: Returns the list of favorites.
    POST: Toggles the favorite status of a specific image path.
    """
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

# --- UPLOAD HANDLING ---

from werkzeug.utils import secure_filename

@app.route('/api/upload', methods=['POST'])
def upload_files():
    """
    API Endpoint: Handles file uploads.
    Accepts 'target_folder' and a list of files.
    Preserves relative paths for folder uploads.
    """
    target_folder = request.form.get('target_folder', '')
    
    # Sanitize target folder to prevent directory traversal
    # We allow subdirectories in target_folder, but we need to be careful
    # secure_filename only returns the basename, so we need to split and sanitize
    if target_folder:
        parts = [secure_filename(p) for p in target_folder.split('/')]
        target_folder = os.path.join(*parts)
    
    upload_base = os.path.join(BASE_DIR, target_folder)
    
    if not os.path.exists(upload_base):
        try:
            os.makedirs(upload_base)
        except OSError as e:
            return jsonify({"error": f"Could not create target directory: {e}"}), 500

    uploaded_files = request.files.getlist('files')
    
    if not uploaded_files:
        return jsonify({"error": "No files provided"}), 400

    saved_files = []
    errors = []

    for file in uploaded_files:
        if file.filename == '':
            continue
            
        # The filename here might contain the relative path from the client
        # e.g., "MyFolder/Sub/image.png"
        # We need to preserve this structure relative to upload_base
        
        # NOTE: Flask/Werkzeug might flatten filename, so we rely on the client 
        # sending the relative path, or we trust the filename if it contains slashes.
        # However, standard multipart/form-data usually just sends the basename.
        # To support folder structure, the frontend should append the relative path 
        # to the filename or send it as a separate field.
        # A common trick is `formData.append('files', file, file.webkitRelativePath)`
        
        filename = file.filename
        
        # Sanitize the path components
        path_parts = filename.split('/')
        safe_parts = [secure_filename(p) for p in path_parts]
        safe_filename = os.path.join(*safe_parts)
        
        destination = os.path.join(upload_base, safe_filename)
        
        # Ensure destination directory exists
        dest_dir = os.path.dirname(destination)
        if not os.path.exists(dest_dir):
            os.makedirs(dest_dir, exist_ok=True)
            
        try:
            file.save(destination)
            saved_files.append(safe_filename)
        except Exception as e:
            errors.append(f"Failed to save {filename}: {e}")

    return jsonify({
        "message": f"Successfully uploaded {len(saved_files)} files.",
        "saved": saved_files,
        "errors": errors
    })

# --- NEW ROUTE TO CLEAR CACHE ---
@app.route('/api/cache/clear', methods=['POST'])
def clear_cache():
    """Clears the entire cache to scan for new files"""
    cache.clear()
    return jsonify({"status": "Cache cleared", "message": "Libraries rescanned"})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)