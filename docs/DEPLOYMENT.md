# Deployment Guide

These instructions are intended for **Linux-based systems** (Ubuntu, Debian, CentOS, etc.) where you want to run the application as a background service for better performance and stability. This setup uses **Gunicorn** as the application server and **Nginx** as a reverse proxy and static file server.

## Prerequisites

*   A Linux server or desktop.
*   `systemd` (standard init system on most modern distros).
*   `nginx` installed (`sudo apt install nginx` or equivalent).
*   Python environment set up as per the main README.

## 1. Install Gunicorn

Activate your virtual environment and install Gunicorn:

```bash
pip install gunicorn
```

## 2. Configure Nginx

Nginx can serve the images directly, drastically improving load times for large files compared to serving them through Python.

Create a configuration file (e.g., `/etc/nginx/sites-available/drawing-app`) with the following content. **Make sure to update the `alias` path to match your `BASE_DIR`.**

```nginx
server {
    listen 80;
    server_name _;

    # 1. Optimization for large images
    client_max_body_size 0; # No upload limit
    sendfile on;            # Kernel acceleration for file sending
    tcp_nopush on;
    
    # 2. Serve images DIRECTLY (Bypassing Python)
    # When URL starts with /media/, Nginx looks on disk.
    location /media/ {
        alias /path/to/your/references/; # <--- UPDATE THIS PATH
        expires 30d;        # Browser cache for 30 days (History will be instant!)
        add_header Cache-Control "public, no-transform";
        try_files $uri $uri/ =404;
    }

    # 3. Pass everything else (API, HTML) to Gunicorn
    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Enable the site and restart Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/drawing-app /etc/nginx/sites-enabled/
sudo systemctl restart nginx
```

## 3. Systemd Service (Auto-start)

Create a systemd service to keep the app running in the background and restart it automatically if it crashes.

Create `/etc/systemd/system/drawing-app.service`:

```ini
[Unit]
Description=Gunicorn instance to serve DrawingApp
After=network.target

[Service]
# User running the script
User=your_user
# Group (usually the same as user)
Group=your_group

# Project directory
WorkingDirectory=/path/to/drawing-app

# Environment path (Bin folder of your python env)
Environment="PATH=/path/to/your/python/env/bin"

# Command to start the app
# -w 3: number of worker processes
# -b 127.0.0.1:5000: bind to localhost on port 5000 (for Nginx)
ExecStart=/path/to/your/python/env/bin/gunicorn --workers 3 --bind 127.0.0.1:5000 app:app

# Restart automatically if it crashes
Restart=always

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
sudo systemctl start drawing-app
sudo systemctl enable drawing-app
```
