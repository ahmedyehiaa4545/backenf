# Base image
FROM python:3.11-slim

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# Set working directory
WORKDIR /app

# Install system dependencies (including Chromium, ffmpeg, libsndfile1 for soundfile/librosa, and fonts)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    gnupg \
    ffmpeg \
    libsndfile1 \
    build-essential \
    libnss3 \
    libdbus-1-3 \
    libatk1.0-0 \
    libgbm-dev \
    libasound2 \
    libxrandr2 \
    libxkbcommon-dev \
    libxfixes3 \
    libxcomposite1 \
    libxdamage1 \
    libatk-bridge2.0-0 \
    libcups2 \
    libpango-1.0-0 \
    libcairo2 \
    fonts-noto-cjk \
    fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Pre-download DeepFilterNet CLI binary for neural speech enhancement
RUN curl -fsSL -o /usr/local/bin/deep-filter https://github.com/Rikorose/DeepFilterNet/releases/download/v0.5.6/deep-filter-0.5.6-x86_64-unknown-linux-musl \
    && chmod +x /usr/local/bin/deep-filter

# Copy python requirements and install PyTorch CPU first, then rest
COPY requirements.txt .
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir -r requirements.txt

# Copy package.json and install npm dependencies
COPY package.json ./
RUN npm install

# Pre-download Remotion browser for headless Chrome rendering
RUN npx remotion browser ensure

# Copy all project files
COPY . .

# Create public folder if not exists
RUN mkdir -p public

# Expose port (Railway dynamic PORT environment variable)
EXPOSE 7860

# Run FastAPI app with dynamic PORT fallback
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-7860}"]
