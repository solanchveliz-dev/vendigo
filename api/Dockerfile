# Imagen de la API de VendiGo. El mismo binario sirve para la API, el worker, el seed y la creación del admin:
#   api (por defecto) · /app/worker · /app/seed · /app/admin
FROM golang:1.24-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN for c in api worker seed admin; do \
      CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/$c ./cmd/$c || exit 1; \
    done

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/ /app/
EXPOSE 8080
USER nonroot
ENTRYPOINT ["/app/api"]
