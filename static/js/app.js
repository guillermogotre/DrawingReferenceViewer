const { createApp } = Vue;

// --- Lucide Icon Component ---
const LucideIcon = {
    props: ['name', 'class'],
    data() {
        return { svgHtml: '' };
    },
    mounted() {
        this.renderIcon();
    },
    updated() {
        this.renderIcon();
    },
    watch: {
        name: 'renderIcon',
        class: 'renderIcon'
    },
    methods: {
        renderIcon() {
            if (!window.lucide || !window.lucide.createIcons) return;

            const temp = document.createElement('div');
            const i = document.createElement('i');
            i.setAttribute('data-lucide', this.name);
            if (this.class) {
                i.className = this.class;
            }
            temp.appendChild(i);

            try {
                window.lucide.createIcons({
                    root: temp
                });
                this.svgHtml = temp.innerHTML;
            } catch (e) {
                console.error('Lucide render error:', e);
            }
        }
    },
    template: `<span v-html="svgHtml" style="display: contents;"></span>`
};

// --- Recursive Folder Tree Component ---
const FolderTreeItem = {
    name: 'FolderTreeItem',
    props: ['folder', 'selectedFolders', 'searchQuery', 'forceShow'],
    emits: ['toggle-selection', 'select-only'],
    components: {
        'lucide-icon': LucideIcon
    },
    data() {
        return {
            isExpanded: false
        }
    },
    computed: {
        isSelected() {
            return this.selectedFolders.includes(this.folder.path);
        },
        isIndeterminate() {
            if (this.isSelected) return false;
            const hasSelectedDescendant = (node) => {
                if (this.selectedFolders.includes(node.path)) return true;
                return node.children && node.children.some(hasSelectedDescendant);
            };
            return this.folder.children && this.folder.children.some(hasSelectedDescendant);
        },
        selfMatch() {
            if (!this.searchQuery) return false;
            return this.folder.name.toLowerCase().includes(this.searchQuery.toLowerCase());
        },
        hasChildMatch() {
            if (!this.searchQuery) return false;
            const query = this.searchQuery.toLowerCase();
            const check = (node) => {
                if (node.name.toLowerCase().includes(query)) return true;
                return node.children && node.children.some(check);
            };
            return this.folder.children && this.folder.children.some(check);
        },
        shouldShow() {
            if (this.forceShow) return true;
            if (!this.searchQuery) return true;
            return this.selfMatch || this.hasChildMatch;
        }
    },
    watch: {
        searchQuery: {
            immediate: true,
            handler(val) {
                if (val) {
                    // Expand if we match (to show children) or if a child matches (to show path to child)
                    if (this.selfMatch || this.hasChildMatch || this.forceShow) {
                        this.isExpanded = true;
                    }
                } else {
                    this.isExpanded = false;
                }
            }
        },
        forceShow(val) {
            if (val) this.isExpanded = true;
        }
    },
    methods: {
        toggle() {
            this.$emit('toggle-selection', this.folder);
        },
        selectOnly() {
            this.$emit('select-only', this.folder);
        },
        toggleExpand() {
            this.isExpanded = !this.isExpanded;
        }
    },
    template: `
        <div v-if="shouldShow" class="folder-tree-item select-none">
            <div class="flex items-center gap-1 p-1 rounded-lg hover:bg-gray-800/50 transition-colors group">
                
                <!-- Expand Toggle -->
                <div class="w-6 h-6 flex items-center justify-center cursor-pointer hover:bg-gray-700 rounded transition-colors shrink-0"
                     @click.stop="toggleExpand">
                     <lucide-icon v-if="folder.children && folder.children.length" 
                        name="chevron-right" 
                        class="w-4 h-4 text-gray-500 transition-transform duration-200"
                        :class="{'rotate-90': isExpanded}"></lucide-icon>
                </div>

                <!-- Selection Row -->
                <div class="flex items-center gap-2 flex-1 cursor-pointer p-1" @click.stop="toggle" @dblclick.stop="selectOnly">
                    <!-- Checkbox -->
                    <div class="relative flex items-center justify-center w-5 h-5 shrink-0">
                        <div class="w-5 h-5 border-2 border-gray-600 rounded transition-colors"
                             :class="{'bg-indigo-500 border-indigo-500': isSelected, 'bg-gray-700 border-gray-500': isIndeterminate && !isSelected}"></div>
                        <lucide-icon v-if="isSelected" name="check" class="absolute w-3.5 h-3.5 text-white pointer-events-none"></lucide-icon>
                        <lucide-icon v-if="isIndeterminate && !isSelected" name="minus" class="absolute w-3.5 h-3.5 text-white pointer-events-none"></lucide-icon>
                    </div>

                    <!-- Icon -->
                    <lucide-icon name="folder" class="w-4 h-4 text-gray-500 group-hover:text-indigo-400 transition-colors shrink-0"></lucide-icon>
                    
                    <!-- Name -->
                    <span class="text-sm text-gray-300 group-hover:text-white transition-colors break-all">{{ folder.name }}</span>
                </div>
            </div>

            <!-- Children -->
            <div v-if="isExpanded && folder.children && folder.children.length > 0" class="ml-6 border-l border-gray-800 pl-2">
                <folder-tree-item 
                    v-for="child in folder.children" 
                    :key="child.path"
                    :folder="child"
                    :selected-folders="selectedFolders"
                    :search-query="searchQuery"
                    :force-show="forceShow || selfMatch"
                    @toggle-selection="$emit('toggle-selection', $event)"
                    @select-only="$emit('select-only', $event)"
                ></folder-tree-item>
            </div>
        </div>
    `
};

createApp({
    components: {
        'folder-tree-item': FolderTreeItem
    },
    data() {
        return {
            // --- Library State ---
            folders: [], selectedFolders: [], searchQuery: '',

            // --- Image State ---
            currentImage: null, siblings: [], currentIndex: 0,

            // --- History & Favorites ---
            history: [], historyIndex: -1, favorites: [],

            // --- UI State ---
            showFavorites: false, showSettings: false, isLoading: false, isRefreshing: false, showUploadModal: false,

            // --- Upload State ---
            uploadTargetFolder: '', uploadItems: [], isDraggingOver: false, uploadProgress: 0, isUploading: false, isTargetFolderDisabled: false,

            // --- Navigation Input State ---
            isEditingIndex: false,
            tempIndexValue: 1, // Buffer for smooth editing

            // --- Viewer State ---
            timer: 0, isPaused: false, timerInterval: null, grayscaleMode: false, posterizeMode: false, showPosterizeUI: false,
            scale: 0.9, startScale: 0.9, rotation: 0, flipH: false, posX: 0, posY: 0,

            // --- Interaction State ---
            isDragging: false, dragStartX: 0, dragStartY: 0, lastTouchDist: 0,
            uiVisible: true, hasMoved: false,

            // --- Posterization State ---
            posterizeStops: [
                { pos: 0.5 }
            ],
            dragStopIndex: -1,
            lastStopTap: 0, // For double tap detection
            ticking: false, // For RAF throttling
            repaintKey: 0, // For forcing mobile repaints

            // --- Grid State ---
            gridMode: false,
            showGridUI: false,
            gridSize: 50,
        }
    },
    // ... (computed properties remain mostly the same, filteredFolders removed as logic moved to component)
    computed: {

        isCurrentFavorite() { return this.currentImage && this.favorites.includes(this.currentImage.path); },
        filteredFolders() {
            if (!this.searchQuery) return this.folders;
            const query = this.searchQuery.toLowerCase();
            const matches = (node) => {
                if (node.name.toLowerCase().includes(query)) return true;
                return node.children && node.children.some(matches);
            };
            return this.folders.filter(matches);
        },
        areAllVisibleSelected() {
            // Simplified: Just check if we have any selection
            return this.selectedFolders.length > 0;
        },
        sliderGradient() {
            // Generates the CSS linear-gradient for the slider track.
            // This visualizes the posterization thresholds and the gray levels they map to.
            let stops = [...this.posterizeStops].sort((a, b) => a.pos - b.pos);
            let gradient = 'linear-gradient(to right';

            // Number of regions = stops.length + 1
            // We map these regions to equidistant gray values: 0, 1/N, 2/N, ..., 1
            const numRegions = stops.length + 1;

            // Region 0 (Start to first stop)
            let val = 0; // Black
            let color = `rgb(${val * 255},${val * 255},${val * 255})`;
            gradient += `, ${color} 0%`;

            stops.forEach((stop, index) => {
                // End of previous region / Start of current region at stop.pos
                gradient += `, ${color} ${stop.pos * 100}%`;

                // New color for next region
                val = (index + 1) / (numRegions - 1);
                color = `rgb(${val * 255},${val * 255},${val * 255})`;

                gradient += `, ${color} ${stop.pos * 100}%`;
            });

            // End of last region
            gradient += `, ${color} 100%)`;
            return gradient;
        },
        posterizeTableValues() {
            // Generate 256 values for the SVG table
            let values = [];
            let stops = [...this.posterizeStops].sort((a, b) => a.pos - b.pos);

            const numRegions = stops.length + 1;

            // We need to map input 0..1 to output values based on thresholds
            // Iterate through all 256 input levels
            let stopIdx = 0;

            for (let i = 0; i < 256; i++) {
                let pos = i / 255;

                // Advance to next threshold if we passed current one
                while (stopIdx < stops.length && pos >= stops[stopIdx].pos) {
                    stopIdx++;
                }

                // stopIdx is now the index of the region we are in (0 to stops.length)
                // Value for this region is stopIdx / (numRegions - 1)
                let val = stopIdx / (numRegions - 1);
                values.push(val);
            }
            return values.join(' ');
        },
        currentUrl() {
            if (!this.currentImage) return '';
            // Ensure path starts with /media/ to match the Flask route
            // Encode path components to handle special characters like #
            const encodedPath = this.currentImage.path.split('/').map(encodeURIComponent).join('/');
            return `/media/${encodedPath}`;
        },
        layerStyle() {
            // Applies the pan/zoom transformation to the container layer
            return {
                transform: `translate3d(${this.posX}px, ${this.posY}px, 0) scale(${this.scale})`
            }
        },
        imageStyle() {
            const style = {
                transform: `rotate(${this.rotation}deg) scaleX(${this.flipH ? -1 : 1})`
            };

            // --- MOBILE UPDATE FIX ---
            // On some mobile browsers, changing SVG filter attributes doesn't trigger a repaint
            // of the element if the layer itself is considered "static".
            // We use a "Hybrid Fix":
            // 1. The filter is applied via CSS class (.filter-posterize) for reliability.
            // 2. We toggle an invisible box-shadow here using `repaintKey`.
            //    This forces the browser to re-composite the layer on every frame of the slider drag,
            //    ensuring the posterization effect updates in real-time.
            if (this.posterizeMode) {
                style.boxShadow = `0 0 0 ${this.repaintKey}px transparent`;
            }

            return style;
        },
        gridStyle() {
            const size = this.gridSize;
            return {
                backgroundImage: `
                    linear-gradient(to right, rgba(255, 255, 255, 0.3) 1px, transparent 1px),
                    linear-gradient(to bottom, rgba(255, 255, 255, 0.3) 1px, transparent 1px)
                `,
                backgroundSize: `${size}px ${size}px`
            };
        }
    },
    watch: {
        posterizeTableValues() {
            this.updatePosterizeDOM();
        },
        posterizeMode(val) {
            if (val) {
                this.$nextTick(() => {
                    this.updatePosterizeDOM();
                    this.forceRepaint();
                });
            }
        },
        showPosterizeUI(val) {
            if (!val) {
                this.dragStopIndex = -1;
                this.ticking = false;
            }
        },
        // Persistence watcher
        selectedFolders: {
            handler(newVal) {
                localStorage.setItem('selectedFolders', JSON.stringify(newVal));
            },
            deep: true
        }
    },
    mounted() {
        this.fetchFolders();
        window.addEventListener('keydown', this.handleKey);
        window.addEventListener('mousemove', this.dragStop);
        window.addEventListener('mouseup', this.stopDragStop);
        window.addEventListener('touchmove', this.dragStop, { passive: false });
        window.addEventListener('touchend', this.stopDragStop);
        window.addEventListener('touchcancel', this.stopDragStop);
        this.startTimer();
    },
    // ... (beforeUnmount, updated remain same)
    beforeUnmount() {
        window.removeEventListener('keydown', this.handleKey);
        window.removeEventListener('mousemove', this.dragStop);
        window.removeEventListener('mouseup', this.stopDragStop);
        window.removeEventListener('touchmove', this.dragStop);
        window.removeEventListener('touchend', this.stopDragStop);
        window.removeEventListener('touchcancel', this.stopDragStop);
        clearInterval(this.timerInterval);
    },
    updated() {
        lucide.createIcons();
    },
    methods: {
        // ... (existing methods)
        updatePosterizeDOM() {
            // Manually updates the SVG filter attributes in the DOM.
            // Vue's binding sometimes lags or fails for complex SVG attributes on mobile.
            // Direct DOM manipulation ensures the filter definition stays in sync with the slider.
            const filter = document.getElementById('posterizeFilter');
            if (filter) {
                const funcs = filter.querySelectorAll('feFuncR, feFuncG, feFuncB');
                const val = this.posterizeTableValues;
                funcs.forEach(func => func.setAttribute('tableValues', val));
            }
        },
        forceRepaint() {
            // Toggles the repaintKey to trigger the invisible box-shadow change
            // defined in imageStyle. This wakes up the browser's compositor.
            this.repaintKey = this.repaintKey === 0 ? 1 : 0;
        },
        setLoading(state) { this.isLoading = state; },
        onImageLoaded() {
            this.isLoading = false;
            // Force a repaint when image loads to ensure filters are ready
            this.$nextTick(() => this.forceRepaint());
        },
        onImageError() { this.isLoading = false; },
        /**
         * Fetches the folder structure from the backend.
         * Initializes selectedFolders from localStorage or defaults to all.
         */
        async fetchFolders() {
            const res = await fetch('/api/structure');
            this.folders = await res.json();

            // Load from localStorage
            const saved = localStorage.getItem('selectedFolders');
            if (saved) {
                try {
                    this.selectedFolders = JSON.parse(saved);
                } catch (e) {
                    console.error("Failed to parse saved folders", e);
                    this.selectAllFolders();
                }
            } else {
                this.selectAllFolders();
            }

            // Validate selection (remove non-existent folders)
            // Flatten tree to check existence? Or just let it be.
            // Ideally we should clean up, but for now let's just load.

            this.loadRandomImage();
        },
        async refreshLibrary() {
            this.isRefreshing = true;
            try { await fetch('/api/cache/clear', { method: 'POST' }); await this.fetchFolders(); alert("Libraries updated."); }
            catch (e) { console.error(e); alert("Error."); } finally { this.isRefreshing = false; }
        },
        getAllPaths(nodes) {
            let paths = [];
            for (const node of nodes) {
                paths.push(node.path);
                if (node.children) {
                    paths.push(...this.getAllPaths(node.children));
                }
            }
            return paths;
        },
        selectAllFolders() {
            this.selectedFolders = this.getAllPaths(this.folders);
        },
        deselectAllFolders() {
            this.selectedFolders = [];
        },
        toggleVisibleFolders() {
            if (this.selectedFolders.length > 0) {
                this.deselectAllFolders();
            } else {
                this.selectAllFolders();
            }
        },
        // Recursive selection logic
        toggleFolderSelection(folder) {
            const isSelected = this.selectedFolders.includes(folder.path);
            const targetState = !isSelected;

            // Collect all descendant paths
            const descendants = this.getAllPaths([folder]);

            if (targetState) {
                // Add all descendants that aren't already selected
                const toAdd = descendants.filter(p => !this.selectedFolders.includes(p));
                this.selectedFolders = [...this.selectedFolders, ...toAdd];
            } else {
                // Remove all descendants
                this.selectedFolders = this.selectedFolders.filter(p => !descendants.includes(p));
            }
        },
        selectOnly(folder) {
            // Select ONLY this folder and its descendants
            const descendants = this.getAllPaths([folder]);
            this.selectedFolders = descendants;
        },
        // ... (rest of methods)
        async fetchFavorites() { try { const res = await fetch('/api/favorites'); this.favorites = await res.json(); } catch (e) { } },
        async toggleFavorite() {
            if (!this.currentImage) return;
            const path = this.currentImage.path;
            if (this.favorites.includes(path)) { this.favorites = this.favorites.filter(f => f !== path); } else { this.favorites.push(path); }
            try { await fetch('/api/favorites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: path }) }); } catch (e) { this.fetchFavorites(); }
        },
        /**
         * Loads a random image from the selected folders.
         * Resets transformation and timer.
         */
        async loadRandomImage() {
            if (this.selectedFolders.length === 0) { this.showSettings = true; return; }
            this.setLoading(true); this.resetTransform(); this.resetTimer();
            try {
                const res = await fetch('/api/random', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folders: this.selectedFolders }) });
                const data = await res.json(); if (data.error) throw new Error(data.error);
                this.currentImage = data; this.siblings = data.siblings; this.currentIndex = data.index;
                this.pushToHistory(data);
            } catch (e) { console.error(e); this.setLoading(false); }
        },
        async loadFavorite(path) {
            this.showFavorites = false; this.setLoading(true); this.resetTransform(); this.resetTimer();
            try {
                const res = await fetch(`/api/context?path=${encodeURIComponent(path)}`);
                const data = await res.json(); if (data.error) throw new Error(data.error);
                this.currentImage = data; this.siblings = data.siblings; this.currentIndex = data.index;
                this.pushToHistory(data);
            } catch (e) { console.error(e); this.setLoading(false); alert("Image not found."); }
        },
        navSibling(offset) {
            if (!this.siblings.length) return;
            let newIndex = this.currentIndex + offset;
            if (newIndex < 0) newIndex = 0; if (newIndex >= this.siblings.length) newIndex = this.siblings.length - 1;
            if (newIndex === this.currentIndex) return;
            this.jumpToIndex(newIndex);
        },
        jumpToIndex(index) {
            this.setLoading(true);
            this.currentIndex = index;
            const newPath = this.siblings[index];
            const newState = { ...this.currentImage, path: newPath, filename: newPath.split('/').pop(), index: index, siblings: this.siblings };
            this.currentImage = newState; this.resetTransform(); this.pushToHistory(newState);
        },
        // --- FIX DEL INPUT ---
        startEditingIndex() {
            this.tempIndexValue = this.currentIndex + 1; // Copiamos el valor actual a la variable temporal
            this.isEditingIndex = true;
            this.$nextTick(() => { if (this.$refs.indexInput) { this.$refs.indexInput.focus(); this.$refs.indexInput.select(); } });
        },
        commitIndexChange() {
            this.isEditingIndex = false;
            let val = parseInt(this.tempIndexValue); // Leemos de la temporal
            if (isNaN(val)) return;
            let targetIndex = val - 1;
            if (targetIndex < 0) targetIndex = 0;
            if (targetIndex >= this.siblings.length) targetIndex = this.siblings.length - 1;
            if (targetIndex !== this.currentIndex) { this.jumpToIndex(targetIndex); }
        },
        pushToHistory(imageData) {
            if (this.historyIndex < this.history.length - 1) { this.history = this.history.slice(0, this.historyIndex + 1); }
            const snapshot = JSON.parse(JSON.stringify(imageData));
            this.history.push(snapshot); this.historyIndex = this.history.length - 1;
        },
        restoreFromHistory(index) {
            this.setLoading(true);
            const data = this.history[index];
            this.currentImage = data; this.siblings = data.siblings; this.currentIndex = data.index;
            this.resetTransform();
        },
        goHistory(direction) {
            const newIndex = this.historyIndex + direction;
            if (newIndex >= 0 && newIndex < this.history.length) { this.historyIndex = newIndex; this.restoreFromHistory(newIndex); }
        },
        saveAndStart() { this.showSettings = false; this.loadRandomImage(); },
        handleWheel(e) {
            e.preventDefault();
            // Zoom (Ctrl + Wheel or Trackpad Pinch)
            if (e.ctrlKey || e.metaKey) {
                const zoomFactor = 1 - (e.deltaY * 0.01);

                // Calculate new scale
                let newScale = this.scale * zoomFactor;
                newScale = Math.min(Math.max(0.1, newScale), 10);
                const scaleRatio = newScale / this.scale;

                // Get mouse position relative to screen center
                const rect = this.$refs.viewer.getBoundingClientRect();
                const screenCenter = {
                    x: rect.left + rect.width / 2,
                    y: rect.top + rect.height / 2
                };
                const mouseX = e.clientX - screenCenter.x;
                const mouseY = e.clientY - screenCenter.y;

                // Apply zoom towards mouse position
                // Formula: P_new = M - (M - P_old) * ratio
                this.posX = mouseX - (mouseX - this.posX) * scaleRatio;
                this.posY = mouseY - (mouseY - this.posY) * scaleRatio;
                this.scale = newScale;
                return;
            }

            // Pan or Regular Scroll Zoom
            const isTrackpad = Math.abs(e.deltaY) < 40 && e.deltaMode === 0;
            const hasHorizontal = Math.abs(e.deltaX) > 0;

            if (hasHorizontal || isTrackpad) {
                this.posX -= e.deltaX;
                this.posY -= e.deltaY;
            } else {
                // Regular mouse wheel zoom (also towards cursor)
                const direction = e.deltaY > 0 ? 0.9 : 1.1;

                let newScale = this.scale * direction;
                newScale = Math.min(Math.max(0.1, newScale), 10);
                const scaleRatio = newScale / this.scale;

                const rect = this.$refs.viewer.getBoundingClientRect();
                const screenCenter = {
                    x: rect.left + rect.width / 2,
                    y: rect.top + rect.height / 2
                };
                const mouseX = e.clientX - screenCenter.x;
                const mouseY = e.clientY - screenCenter.y;

                this.posX = mouseX - (mouseX - this.posX) * scaleRatio;
                this.posY = mouseY - (mouseY - this.posY) * scaleRatio;
                this.scale = newScale;
            }
        },
        applyZoom(factor) { let newScale = this.scale * factor; this.scale = Math.min(Math.max(0.1, newScale), 10); },
        // Touch handling
        /**
         * Handles the start of a touch event.
         * Supports single touch for panning and double touch for pinch-zoom.
         */
        handleTouchStart(e) {
            if (e.touches.length === 1) {
                this.isDragging = true;
                this.dragStartX = e.touches[0].clientX - this.posX;
                this.dragStartY = e.touches[0].clientY - this.posY;
                this.hasMoved = false;
            } else if (e.touches.length === 2) {
                this.isDragging = false;
                const dist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                this.startScale = this.scale;
                this.lastTouchDist = dist;

                // Calculate center point for zoom
                this.pinchCenter = {
                    x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
                    y: (e.touches[0].clientY + e.touches[1].clientY) / 2
                };
                // Store initial pos to calculate offset during zoom
                this.startPos = { x: this.posX, y: this.posY };
            }
        },
        /**
         * Handles touch movement.
         * Updates position for panning or scale/position for pinch-zoom.
         */
        handleTouchMove(e) {
            e.preventDefault(); // Prevent scrolling
            if (e.touches.length === 1 && this.isDragging) {
                const newX = e.touches[0].clientX - this.dragStartX;
                const newY = e.touches[0].clientY - this.dragStartY;
                if (Math.abs(newX - this.posX) > 2 || Math.abs(newY - this.posY) > 2) {
                    this.hasMoved = true;
                }
                this.posX = newX;
                this.posY = newY;
            } else if (e.touches.length === 2) {
                const dist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );

                if (this.lastTouchDist > 0) {
                    const newScale = this.startScale * (dist / this.lastTouchDist);
                    const clampedScale = Math.min(Math.max(0.1, newScale), 10);

                    // Calculate current center of the pinch
                    const currentCenter = {
                        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
                        y: (e.touches[0].clientY + e.touches[1].clientY) / 2
                    };

                    // Get screen center (transform origin is center center)
                    const rect = this.$refs.viewer.getBoundingClientRect();
                    const screenCenter = {
                        x: rect.left + rect.width / 2,
                        y: rect.top + rect.height / 2
                    };

                    // Calculate new position to keep the point under the pinch center stable
                    // Formula: T_current = (P_current - C_screen) - (P_start - C_screen - T_start) * Ratio
                    const scaleRatio = clampedScale / this.startScale;

                    this.posX = (currentCenter.x - screenCenter.x) - (this.pinchCenter.x - screenCenter.x - this.startPos.x) * scaleRatio;
                    this.posY = (currentCenter.y - screenCenter.y) - (this.pinchCenter.y - screenCenter.y - this.startPos.y) * scaleRatio;
                    this.scale = clampedScale;
                }
            }
        },
        handleTouchEnd(e) {
            this.isDragging = false;
            if (e.touches.length < 2) {
                this.lastTouchDist = 0;
            }
            // Tap detection for UI toggle
            if (!this.hasMoved) {
                this.toggleUI();
                if (e.cancelable) e.preventDefault();
            }
            this.hasMoved = false;
        },
        startDrag(e) {
            if (e.button !== 0) return;
            this.isDragging = true;
            this.dragStartX = e.clientX - this.posX;
            this.dragStartY = e.clientY - this.posY;
            this.hasMoved = false;
        },
        onDrag(e) {
            if (!this.isDragging) return;
            e.preventDefault();
            const newX = e.clientX - this.dragStartX;
            const newY = e.clientY - this.dragStartY;

            // Check if actually moved (to distinguish click from drag)
            if (Math.abs(newX - this.posX) > 2 || Math.abs(newY - this.posY) > 2) {
                this.hasMoved = true;
            }

            this.posX = newX;
            this.posY = newY;
        },
        stopDrag() {
            if (this.isDragging && !this.hasMoved) {
                this.toggleUI();
            }
            this.isDragging = false;
            this.hasMoved = false;
        },
        toggleUI() {
            this.uiVisible = !this.uiVisible;
        },
        togglePosterize() {
            if (!this.posterizeMode) {
                // Enable
                this.posterizeMode = true;
                this.showPosterizeUI = true;
                this.uiVisible = true; // Ensure UI is visible
                this.grayscaleMode = false;
                // Initialize default stops if empty
                if (this.posterizeStops.length === 0) {
                    this.posterizeStops = [
                        { pos: 0.5 } // Single threshold = 2 values (Black/White)
                    ];
                }
            } else {
                // Already enabled
                if (!this.showPosterizeUI) {
                    // UI hidden, just show it
                    this.showPosterizeUI = true;
                    this.uiVisible = true; // Ensure UI is visible
                } else {
                    // UI visible, disable everything
                    this.posterizeMode = false;
                    this.showPosterizeUI = false;
                }
            }
        },
        toggleGrid() {
            if (!this.gridMode) {
                this.gridMode = true;
                this.showGridUI = true;
                this.uiVisible = true;
            } else {
                if (!this.showGridUI) {
                    this.showGridUI = true;
                    this.uiVisible = true;
                } else {
                    this.gridMode = false;
                    this.showGridUI = false;
                }
            }
        },
        addThreshold(e) {
            if (this.$refs.sliderTrack && (e.target === this.$refs.sliderTrack || e.target.parentElement === this.$refs.sliderTrack)) {
                const rect = this.$refs.sliderTrack.getBoundingClientRect();
                const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));

                this.posterizeStops.push({ pos });
                this.dragStopIndex = this.posterizeStops.length - 1;
            }
        },
        removeStop(index) {
            if (this.posterizeStops.length > 1) {
                this.posterizeStops.splice(index, 1);
            }
        },
        startDragStop(e, index) {
            this.dragStopIndex = index;
        },
        handleStopTouchStart(e, index) {
            e.stopPropagation(); // Prevent adding new threshold
            const now = Date.now();
            if (now - this.lastStopTap < 300) {
                // Double tap detected
                this.removeStop(index);
                this.lastStopTap = 0;
            } else {
                this.lastStopTap = now;
                this.dragStopIndex = index;
            }
        },
        dragStop(e) {
            if (this.dragStopIndex === -1) return;

            // Prevent default to stop scrolling while dragging slider
            if (e.cancelable) e.preventDefault();

            const rect = this.$refs.sliderTrack.getBoundingClientRect();
            let clientX;
            if (e.touches && e.touches.length > 0) {
                clientX = e.touches[0].clientX;
            } else {
                clientX = e.clientX;
            }

            if (this.ticking) return;
            this.ticking = true;

            requestAnimationFrame(() => {
                try {
                    let pos = (clientX - rect.left) / rect.width;
                    pos = Math.max(0, Math.min(1, pos));

                    this.posterizeStops[this.dragStopIndex].pos = pos;

                    // Trigger lightweight repaint
                    this.repaintKey = (this.repaintKey + 1) % 2;
                } finally {
                    this.ticking = false;
                }
            });
        },
        stopDragStop() {
            this.dragStopIndex = -1;
            this.ticking = false;
        },
        resetTransform() { this.scale = 0.9; this.rotation = 0; this.flipH = false; this.posX = 0; this.posY = 0; },
        rotateRight() { this.rotation += 90; },
        startTimer() { this.timerInterval = setInterval(() => { if (!this.isPaused && this.currentImage && !this.showSettings && !this.showFavorites && !this.isLoading) this.timer++; }, 1000); },
        resetTimer() { this.timer = 0; this.isPaused = false; }, togglePlay() { this.isPaused = !this.isPaused; },
        formatTime(s) { return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`; },
        /**
         * Global keyboard event handler.
         * Maps keys to actions (Space: Next, Arrows: Nav/History, F: Flip, R: Rotate, etc.)
         */
        handleKey(e) {
            if ((this.showSettings || this.showFavorites || this.isEditingIndex) && e.key !== 'Escape' && e.key !== 'Enter') return;
            if (e.key === ' ' && e.target.tagName !== 'INPUT') e.preventDefault();

            if (e.key === ' ') this.loadRandomImage();
            else if (e.key === 'ArrowRight') this.navSibling(1);
            else if (e.key === 'ArrowLeft') this.navSibling(-1);
            else if (e.key === 'ArrowDown') { e.preventDefault(); this.goHistory(-1); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); this.goHistory(1); }
            else if (e.key.toLowerCase() === 'f') this.flipH = !this.flipH;
            else if (e.key.toLowerCase() === 'r') this.rotateRight();
            else if (e.key.toLowerCase() === 'g') { this.grayscaleMode = !this.grayscaleMode; if (this.grayscaleMode) this.posterizeMode = false; }
            else if (e.key.toLowerCase() === 'p') this.togglePosterize();
            else if (e.key.toLowerCase() === 'h') this.toggleGrid();
            else if (e.key.toLowerCase() === 'm') this.toggleFavorite();
            else if (e.key === 'Escape') { this.showSettings = false; this.showFavorites = false; this.isEditingIndex = false; this.showUploadModal = false; }
        },
        // --- UPLOAD LOGIC ---
        openUploadModal() {
            this.showUploadModal = true;
            this.resetUploadState();
        },
        resetUploadState() {
            this.uploadItems = [];
            this.uploadTargetFolder = '';
            this.isDraggingOver = false;
            this.uploadProgress = 0;
            this.isUploading = false;
            this.isTargetFolderDisabled = false;
        },
        async handleDrop(e) {
            this.isDraggingOver = false;
            const items = e.dataTransfer.items;
            if (!items) return;

            const queue = [];
            // Use webkitGetAsEntry for recursive folder scanning
            for (let i = 0; i < items.length; i++) {
                const entry = items[i].webkitGetAsEntry();
                if (entry) {
                    queue.push(this.traverseFileTree(entry));
                }
            }

            // Wait for all scanning to complete
            const results = await Promise.all(queue);
            const flatResults = results.flat();

            this.processUploadQueue(flatResults);
        },
        async traverseFileTree(item, path = '') {
            const VALID_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'];
            if (item.isFile) {
                return new Promise((resolve) => {
                    item.file((file) => {
                        const ext = '.' + file.name.split('.').pop().toLowerCase();
                        if (VALID_EXTENSIONS.includes(ext)) {
                            resolve([{
                                file: file,
                                name: file.name,
                                fullPath: path + file.name,
                                isFile: true,
                                entry: item
                            }]);
                        } else {
                            resolve([]);
                        }
                    });
                });
            } else if (item.isDirectory) {
                const dirReader = item.createReader();
                const entries = [];

                const readEntries = async () => {
                    const result = await new Promise((resolve) => {
                        dirReader.readEntries((res) => resolve(res), (err) => resolve([]));
                    });

                    if (result.length > 0) {
                        entries.push(...result);
                        await readEntries(); // Continue reading (readEntries returns max 100 items)
                    }
                };

                await readEntries();

                const promises = entries.map(entry => this.traverseFileTree(entry, path + item.name + '/'));
                const results = await Promise.all(promises);
                return results.flat();
            }
            return [];
        },
        processUploadQueue(newItems) {
            // Determine if we have multiple root folders
            // We look at the top-level folders in the new items
            const roots = new Set();
            newItems.forEach(item => {
                const parts = item.fullPath.split('/');
                if (parts.length > 1) {
                    roots.add(parts[0]);
                }
            });

            // Logic for Target Folder Input State
            // If multiple folders are dropped, disable input
            // If mix of files and folders, we might want to force a target or allow default

            // Current requirement: 
            // "If multiple folders are selected the target_folder input text must be disabled...
            // if a mix of images and folders are dropped all of them will go inside target_folder."

            const hasRootFiles = newItems.some(item => !item.fullPath.includes('/'));
            const rootFolders = Array.from(roots);

            // Logic Update:
            // If we have ONLY folders (no root files), we disable target input and use original folder names.
            // This applies to both single and multiple folders.
            // If there are any files at the root level (mixed or just files), we use the target folder.

            if (!hasRootFiles && rootFolders.length > 0) {
                this.isTargetFolderDisabled = true;
                this.uploadTargetFolder = '';
            } else {
                // Files present or mix: All go to target folder
                this.isTargetFolderDisabled = false;
                if (!this.uploadTargetFolder) this.uploadTargetFolder = 'Dropped';
            }

            // Process items to determine final destination
            // We need to check for collisions with EXISTING folders in the app
            // this.folders contains the list of root folders in BASE_DIR

            // BETTER APPROACH: Calculate root mappings first
            const rootMappings = {};
            if (this.isTargetFolderDisabled) {
                rootFolders.forEach(root => {
                    let finalName = root;
                    if (this.folders.includes(root)) {
                        // Check if we already generated a mapping for this session? 
                        // No, this is a fresh drop.
                        // But wait, if I drop "Folder" twice? 
                        // The collision check `this.folders.includes` checks the SERVER state.
                        // It doesn't check against `rootMappings` (self-collision in batch? Unlikely for drag-drop).
                        finalName = root + '_' + Date.now().toString().slice(-4);
                    }
                    rootMappings[root] = finalName;
                });
            }

            const finalProcessed = newItems.map(item => {
                let destination = '';
                if (this.isTargetFolderDisabled) {
                    const rootName = item.fullPath.split('/')[0];
                    const finalRoot = rootMappings[rootName] || rootName;
                    destination = item.fullPath.replace(rootName, finalRoot);
                } else {
                    destination = item.fullPath;
                }
                return { ...item, destination };
            });

            this.uploadItems = [...this.uploadItems, ...finalProcessed];
        },
        async uploadFiles() {
            if (this.uploadItems.length === 0) return;
            this.isUploading = true;
            this.uploadProgress = 0;

            const formData = new FormData();

            // If target folder is enabled, we send it. 
            // If disabled (multi-folder mode), we rely on the relative paths we constructed?
            // Actually, the backend expects `target_folder` and `files`.
            // But `files` in multipart don't carry the full path usually.
            // We need a way to tell backend the destination for EACH file.

            // Strategy:
            // We will append files to formData.
            // AND we will append a JSON map of filename -> destination path.
            // OR we use the `webkitRelativePath` trick if supported, but we constructed our own paths.

            // Let's send `target_folder` as the base.
            // If `isTargetFolderDisabled`, we send empty target_folder, and the filenames MUST contain the root.

            const target = this.isTargetFolderDisabled ? '' : this.uploadTargetFolder;
            formData.append('target_folder', target);

            this.uploadItems.forEach(item => {
                // We rename the file object to include the relative path?
                // No, we can't easily rename File objects.
                // We can append the path as the filename in formData.
                formData.append('files', item.file, item.destination);
            });

            const xhr = new XMLHttpRequest();

            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    this.uploadProgress = Math.round((e.loaded * 100) / e.total);
                }
            });

            xhr.onreadystatechange = () => {
                if (xhr.readyState === 4) {
                    this.isUploading = false;
                    if (xhr.status === 200) {
                        alert("Upload complete!");
                        this.showUploadModal = false;
                        this.refreshLibrary(); // Refresh to show new files
                    } else {
                        alert("Upload failed: " + xhr.statusText);
                    }
                }
            };

            xhr.open('POST', '/api/upload', true);
            xhr.send(formData);
        }
    }
}).mount('#app');
