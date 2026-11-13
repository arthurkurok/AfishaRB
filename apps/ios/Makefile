# iOS-приложение «Тамаша»: воспроизводимая сборка из исходников монорепозитория.
#   make bootstrap  — токены, клиент API, шрифты, иконка, проект Xcode
#   make test       — юнит- и снапшот-тесты AfishaKit на macOS (без симулятора)
#   make build      — сборка приложения и виджета под симулятор iOS

ROOT := $(abspath ../..)
BUILD := $(CURDIR)/build
TOKENS := $(ROOT)/packages/design-tokens/tokens.json

# Ассеты (AppIcon, цвета) в Xcode 26 компилирует actool, которому нужен установленный runtime
# симулятора iOS. Без него: `make build NO_ASSETS=1` — проверка кода, Info.plist и каталогов строк.
ifdef NO_ASSETS
ASSET_FLAGS := EXCLUDED_SOURCE_FILE_NAMES=Assets.xcassets ASSETCATALOG_COMPILER_APPICON_NAME= ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME=
endif

.PHONY: bootstrap tokens api fonts icon fixtures project test record-snapshots build build-scheme clean

bootstrap: tokens api fonts icon project

tokens:
	swift Scripts/generate-tokens.swift $(TOKENS) AfishaKit/Sources/AfishaUI/Generated/Tokens.swift Afisha/Resources/Assets.xcassets

api:
	Scripts/generate-api.sh

fonts:
	Scripts/fetch-fonts.sh

icon:
	swift Scripts/generate-app-icon.swift $(TOKENS) Afisha/Resources/Assets.xcassets/AppIcon.appiconset

# Требует запущенного API (pnpm --filter @afisha/api start)
fixtures:
	node Scripts/capture-fixtures.mjs

project:
	xcodegen generate

test:
	cd AfishaKit && swift test

record-snapshots:
	cd AfishaKit && SNAPSHOT_RECORD=1 swift test --filter AfishaUITests

# Сборка по схеме: нужен установленный компонент «iOS Simulator» в Xcode
build-scheme: project
	xcodebuild -project Afisha.xcodeproj -scheme Afisha -sdk iphonesimulator \
	  -destination 'generic/platform=iOS Simulator' -derivedDataPath $(BUILD)/DerivedData build

# Сборка по таргету: работает и без runtime симулятора (вместе с NO_ASSETS=1)
build: project
	xcodebuild -project Afisha.xcodeproj -target Afisha -configuration Debug -sdk iphonesimulator -arch arm64 \
	  SYMROOT=$(BUILD)/Products OBJROOT=$(BUILD)/Intermediates \
	  -clonedSourcePackagesDirPath $(BUILD)/SourcePackages $(ASSET_FLAGS) build

clean:
	rm -rf $(BUILD) AfishaKit/.build Afisha.xcodeproj
