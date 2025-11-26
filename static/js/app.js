const { createApp } = Vue;

createApp({
    data() {
        return {
            folders: [], selectedFolders: [], searchQuery: '',
            currentImage: null, siblings: [], currentIndex: 0,
            history: [], historyIndex: -1, favorites: [],
            showFavorites: false, showSettings: false, isLoading: false, isRefreshing: false,

            isEditingIndex: false,
            tempIndexValue: 1, // Buffer for smooth editing

            timer: 0, isPaused: false, timerInterval: null, grayscaleMode: false, posterizeMode: false, showPosterizeUI: false,
            scale: 0.9, startScale: 0.9, rotation: 0, flipH: false, posX: 0, posY: 0,
            isDragging: false, dragStartX: 0, dragStartY: 0, lastTouchDist: 0,
            uiVisible: true, hasMoved: false,
            posterizeStops: [
                { pos: 0.5 }
            ],
            dragStopIndex: -1,
            lastStopTap: 0, // For double tap detection
        }
    },
    computed: {
        currentUrl() { return this.currentImage ? `/media/${this.currentImage.path}` : ''; },
        layerStyle() { return { transform: `translate(${this.posX}px, ${this.posY}px) rotate(${this.rotation}deg) scale(${this.scale})` }; },
        imageStyle() { return { transform: this.flipH ? 'scaleX(-1)' : 'scaleX(1)' }; },
        isCurrentFavorite() { return this.currentImage && this.favorites.includes(this.currentImage.path); },
        filteredFolders() {
            if (!this.searchQuery) return this.folders;
            const query = this.searchQuery.toLowerCase();
            return this.folders.filter(f => f.toLowerCase().includes(query));
        },
        areAllVisibleSelected() {
            if (this.filteredFolders.length === 0) return false;
            return this.filteredFolders.every(f => this.selectedFolders.includes(f));
        },
        sliderGradient() {
            let stops = [...this.posterizeStops].sort((a, b) => a.pos - b.pos);
            let gradient = 'linear-gradient(to right';

            // Number of regions = stops.length + 1
            // Values are equidistant: 0, 1/N, 2/N, ..., 1
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
        }
    },
    mounted() {
        this.fetchFolders();
        window.addEventListener('keydown', this.handleKey);
        window.addEventListener('mousemove', this.dragStop);
        window.addEventListener('mouseup', this.stopDragStop);
        window.addEventListener('touchmove', this.dragStop);
        window.addEventListener('touchend', this.stopDragStop);
        this.startTimer();
    },
    beforeUnmount() {
        window.removeEventListener('keydown', this.handleKey);
        window.removeEventListener('mousemove', this.dragStop);
        window.removeEventListener('mouseup', this.stopDragStop);
        window.removeEventListener('touchmove', this.dragStop);
        window.removeEventListener('touchend', this.stopDragStop);
        clearInterval(this.timerInterval);
    },
    updated() {
        lucide.createIcons();
    },
    methods: {
        setLoading(state) { this.isLoading = state; },
        onImageLoaded() { this.isLoading = false; },
        onImageError() { this.isLoading = false; },
        async fetchFolders() {
            const res = await fetch('/api/structure');
            this.folders = await res.json();
            this.selectedFolders = [...this.folders];
            this.loadRandomImage();
        },
        async refreshLibrary() {
            this.isRefreshing = true;
            try { await fetch('/api/cache/clear', { method: 'POST' }); await this.fetchFolders(); alert("Libraries updated."); }
            catch (e) { console.error(e); alert("Error."); } finally { this.isRefreshing = false; }
        },
        toggleVisibleFolders() {
            if (this.areAllVisibleSelected) { this.selectedFolders = this.selectedFolders.filter(f => !this.filteredFolders.includes(f)); }
            else { const newSelection = new Set([...this.selectedFolders, ...this.filteredFolders]); this.selectedFolders = Array.from(newSelection); }
        },
        selectOnly(folder) { this.selectedFolders = [folder]; },
        async fetchFavorites() { try { const res = await fetch('/api/favorites'); this.favorites = await res.json(); } catch (e) { } },
        async toggleFavorite() {
            if (!this.currentImage) return;
            const path = this.currentImage.path;
            if (this.favorites.includes(path)) { this.favorites = this.favorites.filter(f => f !== path); } else { this.favorites.push(path); }
            try { await fetch('/api/favorites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: path }) }); } catch (e) { this.fetchFavorites(); }
        },
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
                } else {
                    // UI visible, disable everything
                    this.posterizeMode = false;
                    this.showPosterizeUI = false;
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
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            let pos = (clientX - rect.left) / rect.width;
            pos = Math.max(0, Math.min(1, pos));

            this.posterizeStops[this.dragStopIndex].pos = pos;
        },
        stopDragStop() {
            this.dragStopIndex = -1;
        },
        resetTransform() { this.scale = 0.9; this.rotation = 0; this.flipH = false; this.posX = 0; this.posY = 0; },
        rotateRight() { this.rotation += 90; },
        startTimer() { this.timerInterval = setInterval(() => { if (!this.isPaused && this.currentImage && !this.showSettings && !this.showFavorites && !this.isLoading) this.timer++; }, 1000); },
        resetTimer() { this.timer = 0; this.isPaused = false; }, togglePlay() { this.isPaused = !this.isPaused; },
        formatTime(s) { return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`; },
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
            else if (e.key.toLowerCase() === 'm') this.toggleFavorite();
            else if (e.key === 'Escape') { this.showSettings = false; this.showFavorites = false; this.isEditingIndex = false; }
        }
    }
}).mount('#app');
