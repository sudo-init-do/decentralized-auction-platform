# Serve the static frontend with nginx.
#
# Build:  docker build -t auction-frontend .
# Run:    docker run -p 8080:80 auction-frontend
FROM nginx:alpine

RUN rm -rf /usr/share/nginx/html/*

COPY frontend/ /usr/share/nginx/html/

EXPOSE 80
