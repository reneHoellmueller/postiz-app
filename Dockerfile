FROM node:22.20-bookworm-slim
ARG NEXT_PUBLIC_VERSION
ARG NEXT_PUBLIC_BACKEND_URL
ARG NEXT_PUBLIC_UPLOAD_DIRECTORY=/uploads
ENV NEXT_PUBLIC_VERSION=$NEXT_PUBLIC_VERSION
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL
ENV NEXT_PUBLIC_UPLOAD_DIRECTORY=$NEXT_PUBLIC_UPLOAD_DIRECTORY
RUN apt-get update && apt-get install -y --no-install-recommends \
    g++ \
    make \
    python3-pip \
    bash \
    nginx \
&& rm -rf /var/lib/apt/lists/*

RUN addgroup --system www \
 && adduser --system --ingroup www --home /www --shell /usr/sbin/nologin www \
 && mkdir -p /www /uploads \
 && chown -R www:www /www /var/lib/nginx /uploads

RUN npm --no-update-notifier --no-fund --global install pnpm@10.6.1 pm2

WORKDIR /app

COPY . /app
COPY var/docker/nginx.conf /etc/nginx/nginx.conf

RUN touch /app/.env \
 && pnpm install --frozen-lockfile \
 && NODE_OPTIONS="--max-old-space-size=4096" pnpm run build

EXPOSE 5000

CMD ["sh", "-c", "PORT_VALUE=${PORT:-5000}; sed -i \"s/listen 5000/listen ${PORT_VALUE}/\" /etc/nginx/nginx.conf; nginx && pnpm run pm2"]
