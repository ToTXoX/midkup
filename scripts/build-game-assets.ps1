$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$blenderPath = 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'
if (-not (Test-Path -LiteralPath $blenderPath)) { throw "Blender not found: $blenderPath" }
& $blenderPath --background (Join-Path $projectRoot 'mudkip-original.blend') --python-exit-code 1 --python (Join-Path $PSScriptRoot 'build_animation_test.py') -- --game
if ($LASTEXITCODE -ne 0) { throw 'Character animation build failed' }
& $blenderPath --background (Join-Path $projectRoot 'mudkip-garden-v11-perspective.blend') --python-exit-code 1 --python (Join-Path $PSScriptRoot 'build_garden_game_assets.py')
if ($LASTEXITCODE -ne 0) { throw 'Garden preparation failed' }
& $blenderPath --background (Join-Path $projectRoot 'game-assets/source/garden-runtime.blend') --python-exit-code 1 --python (Join-Path $PSScriptRoot 'compress_garden_asset.py')
if ($LASTEXITCODE -ne 0) { throw 'Garden compression failed' }
npm --prefix (Join-Path $projectRoot 'animation-test') run assets:prepare
if ($LASTEXITCODE -ne 0) { throw 'Asset validation or staging failed' }
