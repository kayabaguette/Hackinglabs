# Use a lightweight Python base image
FROM python:3.9-slim

# Install system dependencies
# - nmap: Network scanning
# - netcat: Listener
# - openvpn: VPN connection
# - iputils-ping, curl, wget: Basic utilities
# - procps: For pgrep (VPN status check)
# - sudo: To run openvpn/ligolo with privileges
RUN apt-get update && apt-get install -y \
    nmap \
    netcat-openbsd \
    openvpn \
    iputils-ping \
    curl \
    wget \
    procps \
    sudo \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements first for caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p shared instance
# Ensure database directory exists if using default sqlite path
# (Flask-SQLAlchemy often defaults to instance/ or app root)

# Expose Flask port
EXPOSE 5000

# Expose range of ports for Reverse Shells / File Server / Ligolo
# This is documentation; actual exposure happens in docker run/compose
EXPOSE 8000-8100
EXPOSE 4444

# Create a non-root user for the application, but allow sudo for tools
RUN useradd -m ctfuser && \
    echo "ctfuser ALL=(ALL) NOPASSWD: /usr/sbin/openvpn, /usr/bin/nmap, /app/ligolo-proxy" > /etc/sudoers.d/ctfuser

# Ligolo-ng setup (download binary)
# Note: In a real scenario, you'd verify the checksum or build from source.
# For this example, we'll download a release or assume it's provided.
# Since we don't have internet access to GitHub releases guaranteed in build,
# we'll assume the user provides the binary or we skip it if not present.
# But to be helpful, let's try to download a common version if possible, or placeholder.
RUN if [ ! -f "ligolo-proxy" ]; then \
    echo "Downloading Ligolo-ng proxy placeholder..."; \
    touch ligolo-proxy && chmod +x ligolo-proxy; \
    fi

# Fix permissions
RUN chown -R ctfuser:ctfuser /app

USER ctfuser

# Environment variables
ENV FLASK_APP=app.py
ENV FLASK_ENV=production
# Force Python to not buffer stdout/stderr
ENV PYTHONUNBUFFERED=1

# Command to run the application
# Using Gunicorn or similar is better for prod, but SocketIO needs specific workers.
# For simplicity and compatibility with eventlet/socketio, we'll run app.py directly or via gunicorn with eventlet worker.
# Let's stick to python app.py as defined in the code for now to ensure SocketIO works as tested.
CMD ["python", "app.py"]
