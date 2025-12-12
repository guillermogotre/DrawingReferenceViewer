# Drawing Reference Viewer

A lightweight, self-hosted web application for browsing and viewing local drawing references. Designed to help artists practice gesture drawing and studies by turning a local folder structure into a streamlined study tool.

![Screenshot](readme_images/screen.jpg)

## Features

*   **Smart Randomizer:** Select specific subfolders and instantly load random images for gesture practice.
*   **Deep Zoom & Pan:** Full support for high-resolution images with mouse wheel and touchpad controls.
*   **Image Transformations:** Flip, rotate, and toggle grayscale mode on the fly.
*   **Context Navigation:** Navigate to sibling files within the same folder without leaving the viewer.
*   **Favorites:** Mark images as favorites for quick access later.
*   **Posterization Tool:** Advanced grayscale posterization with customizable thresholds for value studies.
*   **Grid Overlay:** Fixed grid overlay with adjustable size for proportion studies.
*   **Mobile Ready:** Fully responsive design with touch gestures for zooming, panning, and interacting with tools.
*   **Performance:** Server-side caching for handling libraries with thousands of images.

## Tech Stack

*   **Backend:** Python (Flask), Flask-Caching
*   **Frontend:** Vue.js 3, Tailwind CSS

## Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/yourusername/drawing-app.git
    cd drawing-app
    ```

2.  Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```

3.  Configure the environment:
    *   Create a `.env` file in the root directory (or copy `.env.example`).
    *   Set `BASE_DIR` to the absolute path of your reference library.

    ```env
    BASE_DIR="/path/to/your/references"
    ```

## Usage

1.  Start the application:
    ```bash
    python app.py
    ```

2.  Open your browser at `http://localhost:5000`.

### Keyboard Shortcuts

| Key | Action |
| :--- | :--- |
| `SPACE` | Load Random Image |
| `Arrow Left` / `Right` | Previous / Next Image in Folder |
| `Arrow Up` / `Down` | History Back / Forward |
| `F` | Flip Horizontally |
| `R` | Rotate 90° |
| `G` | Toggle Grayscale |
| `P` | Toggle Posterization |
| `H` | Toggle Grid Overlay |
| `M` | Toggle Favorite |
| `ESC` | Close Menus |

## Mobile & Touch Support

The application is fully optimized for mobile devices and tablets (iPad, Android tablets):

*   **Touch Gestures:**
    *   **Pinch:** Zoom in/out.
    *   **Drag:** Pan around the image.
*   **Responsive UI:** All menus and overlays adapt to smaller screens.
*   **Touch-Friendly Controls:** Larger buttons and sliders designed for touch interaction.

## Posterization Tool

The **Posterization Filter** allows you to break down an image into distinct tonal values, which is excellent for value studies.

*   **Activation:** Click the "Layers" icon or press `P`.
*   **How it works:**
    *   **Handles:** The slider handles define the *thresholds* (cutoffs) between values.
    *   **Values:** The app automatically calculates equidistant gray values based on the number of handles.
        *   1 Handle = 2 Values (Black / White)
        *   2 Handles = 3 Values (Black / Gray / White)
        *   3 Handles = 4 Values (Black / Dark Gray / Light Gray / White)
*   **Controls:**
    *   **Add:** Click anywhere on the track to add a new threshold.
    *   **Adjust:** Drag handles to change where the value transitions occur.
    *   **Remove:** Double-click (or double-tap) a handle to remove it.

## Grid Overlay

The **Grid Overlay** provides a fixed reference grid on top of the viewport to help you judge proportions and angles.

*   **Activation:** Click the "Grid" icon in the bottom toolbar.
*   **Behavior:** The grid remains fixed ("stuck" to the screen) while you pan and zoom the image behind it. This simulates a physical grid overlay on your monitor.
*   **Controls:**
    *   **Size Slider:** Adjust the size of the grid squares in real-time.

## Deployment

For advanced users running on **Linux**, you can set up the application as a system service using **Gunicorn** and **Nginx** for improved performance and stability.

👉 **[Read the Deployment Guide](docs/DEPLOYMENT.md)**

## License

[MIT](LICENSE)
