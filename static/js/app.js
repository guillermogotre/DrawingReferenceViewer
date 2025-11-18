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

            timer: 0, isPaused: false, timerInterval: null, grayscaleMode: false,
            scale: 1, startScale: 1, rotation: 0, flipH: false, posX: 0, posY: 0,
            isDragging: false, dragStartX: 0, dragStartY: 0,
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
        }
    },
    mounted() {
        this.fetchFolders(); this.fetchFavorites();
        window.addEventListener('keydown', this.handleKeydown);
        this.startTimer();
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
        async fetchFavorites() { try { const res = await fetch('/api/favorites'); this.favorites = await res.json(); } catch (e) {} },
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
            this.$nextTick(() => { if(this.$refs.indexInput) { this.$refs.indexInput.focus(); this.$refs.indexInput.select(); } });
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
            if (e.ctrlKey || e.metaKey) { const zoomFactor = 1 - (e.deltaY * 0.01); this.applyZoom(zoomFactor); return; }
            const isTrackpad = Math.abs(e.deltaY) < 40 && e.deltaMode === 0;
            const hasHorizontal = Math.abs(e.deltaX) > 0;
            if (hasHorizontal || isTrackpad) { this.posX -= e.deltaX; this.posY -= e.deltaY; } 
            else { const direction = e.deltaY > 0 ? 0.9 : 1.1; this.applyZoom(direction); }
        },
        applyZoom(factor) { let newScale = this.scale * factor; this.scale = Math.min(Math.max(0.1, newScale), 10); },
        handleGestureStart(e) { e.preventDefault(); this.startScale = this.scale; },
        handleGestureChange(e) { e.preventDefault(); this.scale = Math.min(Math.max(0.1, this.startScale * e.scale), 10); },
        handleGestureEnd(e) { e.preventDefault(); },
        startDrag(e) { if (e.button !== 0) return; this.isDragging = true; this.dragStartX = e.clientX - this.posX; this.dragStartY = e.clientY - this.posY; },
        onDrag(e) { if (!this.isDragging) return; e.preventDefault(); this.posX = e.clientX - this.dragStartX; this.posY = e.clientY - this.dragStartY; },
        stopDrag() { this.isDragging = false; },
        resetTransform() { this.scale = 1; this.rotation = 0; this.flipH = false; this.posX = 0; this.posY = 0; },
        rotateRight() { this.rotation += 90; },
        startTimer() { this.timerInterval = setInterval(() => { if (!this.isPaused && this.currentImage && !this.showSettings && !this.showFavorites && !this.isLoading) this.timer++; }, 1000); },
        resetTimer() { this.timer = 0; this.isPaused = false; }, togglePlay() { this.isPaused = !this.isPaused; },
        formatTime(s) { return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`; },
        handleKeydown(e) {
            if ((this.showSettings || this.showFavorites || this.isEditingIndex) && e.key !== 'Escape' && e.key !== 'Enter') return;
            if (e.key === ' ' && e.target.tagName !== 'INPUT') e.preventDefault();
            switch(e.key) {
                case ' ': this.loadRandomImage(); break;
                case 'ArrowRight': this.navSibling(1); break;
                case 'ArrowLeft': this.navSibling(-1); break;
                case 'ArrowDown': e.preventDefault(); this.goHistory(-1); break;
                case 'ArrowUp': e.preventDefault(); this.goHistory(1); break;
                case 'f': this.flipH = !this.flipH; break;
                case 'r': this.rotateRight(); break;
                case 'g': this.grayscaleMode = !this.grayscaleMode; break;
                case 'm': this.toggleFavorite(); break;
                case 'Escape': this.showSettings = false; this.showFavorites = false; this.isEditingIndex = false; break;
            }
        }
    }
}).mount('#app');
