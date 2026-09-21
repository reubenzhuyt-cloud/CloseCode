FROM alpine AS base

ARG BUN_RUNTIME_TRANSPILER_CACHE_PATH=0
ENV BUN_RUNTIME_TRANSPILER_CACHE_PATH=${BUN_RUNTIME_TRANSPILER_CACHE_PATH}
RUN apk add --no-cache libgcc libstdc++ ripgrep

FROM base AS build-amd64
COPY dist/cli-linux-x64-baseline-musl/bin/closecode /usr/local/bin/closecode

FROM base AS build-arm64
COPY dist/cli-linux-arm64-musl/bin/closecode /usr/local/bin/closecode

ARG TARGETARCH
FROM build-${TARGETARCH}
RUN ln -s closecode /usr/local/bin/opencode && ln -s closecode /usr/local/bin/opencode2 && closecode --version && opencode --version && opencode2 --version
ENTRYPOINT ["closecode"]
