# contracts/Makefile
# Build, test, and deploy commands for the NexusEscrow Soroban contract.

NETWORK        ?= testnet
STELLAR_RPC    ?= https://soroban-testnet.stellar.org
NETWORK_PASS   ?= Test SDF Network ; September 2015
CONTRACT_NAME  := nexus-escrow
WASM_PATH      := target/wasm32-unknown-unknown/release/nexus_escrow.wasm
ADMIN_KEY      ?= admin          # stellar keys name (from `stellar keys ls`)

# ─── Build ────────────────────────────────────────────────────────────────────

.PHONY: build
build:
	@echo "Building NexusEscrow contract..."
	cargo build --release --target wasm32-unknown-unknown \
		--manifest-path nexus-escrow/Cargo.toml
	@echo "WASM size: $$(wc -c < $(WASM_PATH)) bytes"

.PHONY: optimize
optimize: build
	@echo "Optimizing WASM..."
	stellar contract optimize --wasm $(WASM_PATH)
	@echo "Optimized size: $$(wc -c < $(WASM_PATH:.wasm=.optimized.wasm)) bytes"

# ─── Test ─────────────────────────────────────────────────────────────────────

.PHONY: test
test:
	@echo "Running all tests..."
	cargo test --features testutils \
		--manifest-path nexus-escrow/Cargo.toml \
		-- --nocapture

.PHONY: test-verbose
test-verbose:
	cargo test --features testutils \
		--manifest-path nexus-escrow/Cargo.toml \
		-- --nocapture --test-threads=1

# ─── Deploy ───────────────────────────────────────────────────────────────────

.PHONY: deploy-testnet
deploy-testnet: build
	@echo "Deploying to Stellar Testnet..."
	stellar contract deploy \
		--wasm $(WASM_PATH) \
		--source $(ADMIN_KEY) \
		--network testnet \
		--network-passphrase "$(NETWORK_PASS)" \
		--rpc-url $(STELLAR_RPC)

.PHONY: deploy-mainnet
deploy-mainnet: optimize
	@echo "Deploying to Stellar Mainnet..."
	@echo "⚠️  Are you sure? Press Ctrl-C to cancel, Enter to continue."
	@read _
	stellar contract deploy \
		--wasm $(WASM_PATH:.wasm=.optimized.wasm) \
		--source $(ADMIN_KEY) \
		--network mainnet \
		--network-passphrase "Public Global Stellar Network ; September 2015" \
		--rpc-url https://mainnet.stellar.validationcloud.io/v1/$$STELLAR_MAINNET_KEY

# ─── Initialize deployed contract ─────────────────────────────────────────────
# Usage: make init CONTRACT_ID=CXXX... ADMIN_ADDR=GXXX... FEE_BPS=100

.PHONY: init
init:
	stellar contract invoke \
		--id $(CONTRACT_ID) \
		--source $(ADMIN_KEY) \
		--network $(NETWORK) \
		-- initialize \
		--admin $(ADMIN_ADDR) \
		--fee_bps $(FEE_BPS)

# ─── Generate TypeScript bindings ─────────────────────────────────────────────

.PHONY: bindings
bindings: build
	@echo "Generating TypeScript bindings..."
	stellar contract bindings typescript \
		--wasm $(WASM_PATH) \
		--contract-id $(CONTRACT_ID) \
		--output-dir ../apps/web/src/lib/contracts/nexus-escrow \
		--overwrite
	@echo "Bindings written to apps/web/src/lib/contracts/nexus-escrow"

# ─── Lint ─────────────────────────────────────────────────────────────────────

.PHONY: lint
lint:
	cargo clippy --features testutils \
		--manifest-path nexus-escrow/Cargo.toml \
		-- -D warnings

.PHONY: fmt
fmt:
	cargo fmt --manifest-path nexus-escrow/Cargo.toml

.PHONY: clean
clean:
	cargo clean --manifest-path nexus-escrow/Cargo.toml
