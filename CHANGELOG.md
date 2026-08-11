# Changelog

## [0.9.0](https://github.com/cmglezpdev/veta/compare/veta-v0.8.0...veta-v0.9.0) (2026-08-11)


### Features

* **cli:** step-by-step extraction progress on stderr ([#34](https://github.com/cmglezpdev/veta/issues/34)) ([e906dd6](https://github.com/cmglezpdev/veta/commit/e906dd67e6602d1cb9859aa3f0b8d3ff21d1dc48))

## [0.8.0](https://github.com/cmglezpdev/veta/compare/veta-v0.7.0...veta-v0.8.0) (2026-08-11)


### Features

* **prompt:** close the README with a key-takeaways section and demand outcomes per note ([#32](https://github.com/cmglezpdev/veta/issues/32)) ([32bbcd3](https://github.com/cmglezpdev/veta/commit/32bbcd3bbe4ad8afd469cc811d0607cbc9c3e22e))
* **thumbnail:** download the video cover and embed it in the notes README ([#31](https://github.com/cmglezpdev/veta/issues/31)) ([6becab6](https://github.com/cmglezpdev/veta/commit/6becab6e6865665274768c7f3594b14249206517))

## [0.7.0](https://github.com/cmglezpdev/veta/compare/veta-v0.6.1...veta-v0.7.0) (2026-08-10)


### Features

* **store:** keep packages in a global ~/.veta home and build notes in the assistant's cwd ([#29](https://github.com/cmglezpdev/veta/issues/29)) ([99d7587](https://github.com/cmglezpdev/veta/commit/99d75872c5ddfd2794c137bf5a00020404169d3e))

## [0.6.1](https://github.com/cmglezpdev/veta/compare/veta-v0.6.0...veta-v0.6.1) (2026-08-10)


### Documentation

* **readme:** add project banner ([4f31473](https://github.com/cmglezpdev/veta/commit/4f31473f9697bc7b010feb8e325153639f28b63a))

## [0.6.0](https://github.com/cmglezpdev/veta/compare/veta-v0.5.0...veta-v0.6.0) (2026-08-07)


### Features

* **cli:** generate a notes prompt and offer Enter-to-copy to clipboard ([#26](https://github.com/cmglezpdev/veta/issues/26)) ([ae17cbb](https://github.com/cmglezpdev/veta/commit/ae17cbb8b427cde52447e7025fe575ee879838fd))

## [0.5.0](https://github.com/cmglezpdev/veta/compare/veta-v0.4.1...veta-v0.5.0) (2026-08-04)


### Features

* **cli:** migrate extract to StorePort ([#18](https://github.com/cmglezpdev/veta/issues/18)) ([b684cc6](https://github.com/cmglezpdev/veta/commit/b684cc62409de84de3a62c21668adf7a1b08b139))
* **store:** add path containment and atomic JSON primitives ([#16](https://github.com/cmglezpdev/veta/issues/16)) ([e2e6aec](https://github.com/cmglezpdev/veta/commit/e2e6aec5e1fd047d1f14cc340edebc33ff386c56))
* **store:** add run domain, StorePort, and valid slug fallback ([#15](https://github.com/cmglezpdev/veta/issues/15)) ([1a2d0ed](https://github.com/cmglezpdev/veta/commit/1a2d0edcb761e7b291801cf9d642b791d3027ab9))
* **store:** implement FsStore with flat layout and atomic persistence ([#17](https://github.com/cmglezpdev/veta/issues/17)) ([05b373c](https://github.com/cmglezpdev/veta/commit/05b373ceb66b76998352021c3f0b09cdb5ee9c1e))


### Documentation

* **roadmap:** record slice 5 as merged and scope slice 6 ([#21](https://github.com/cmglezpdev/veta/issues/21)) ([910d39e](https://github.com/cmglezpdev/veta/commit/910d39ebf90f0e99a9b4eac11f431f5dd8557f5d))

## [0.4.1](https://github.com/cmglezpdev/veta/compare/veta-v0.4.0...veta-v0.4.1) (2026-08-02)


### Bug Fixes

* **transcript:** end paragraphs on completed sentences ([#13](https://github.com/cmglezpdev/veta/issues/13)) ([2897135](https://github.com/cmglezpdev/veta/commit/2897135253fea614c9eaa3b9d1de3b3ffcd97610))


### Documentation

* **readme:** give v0.4 a public install-and-run face ([#12](https://github.com/cmglezpdev/veta/issues/12)) ([11b1387](https://github.com/cmglezpdev/veta/commit/11b138743924b5473f0e9446eb2821adfd0d79aa))

## [0.4.0](https://github.com/cmglezpdev/veta/compare/veta-v0.3.0...veta-v0.4.0) (2026-08-02)


### Features

* **cli:** yargs shell with completion and doctor ([#10](https://github.com/cmglezpdev/veta/issues/10)) ([4d2e79a](https://github.com/cmglezpdev/veta/commit/4d2e79a78b7b7da173506eeeb45add20cf4f568c))

## [0.3.0](https://github.com/cmglezpdev/veta/compare/veta-v0.2.1...veta-v0.3.0) (2026-08-01)


### Features

* **cli:** minimal veta &lt;url&gt; writes transcript.md ([#8](https://github.com/cmglezpdev/veta/issues/8)) ([afc8a8e](https://github.com/cmglezpdev/veta/commit/afc8a8e1504585245963cc60b7259a1f363d77c5))

## [0.2.1](https://github.com/cmglezpdev/veta/compare/veta-v0.2.0...veta-v0.2.1) (2026-07-31)


### Documentation

* correct how release-please reads a merged pull request ([#4](https://github.com/cmglezpdev/veta/issues/4)) ([dda924c](https://github.com/cmglezpdev/veta/commit/dda924cb31abbe59afc73682968149cf03393d99))

## [0.2.0](https://github.com/cmglezpdev/veta/compare/veta-v0.1.0...veta-v0.2.0) (2026-07-29)


### Features

* **cli:** add composition root skeleton with tier-5 smoke test ([ffe2c9c](https://github.com/cmglezpdev/veta/commit/ffe2c9c242f571d4d4e760893b50439c31c3807d))
* **transcript:** group cues into chapter-aware paragraphs ([26400ac](https://github.com/cmglezpdev/veta/commit/26400ac10cf2f25a3eda5eb4a8b0b5dbc1665888))
* **transcript:** parse yt-dlp payloads into normalized cues ([d244074](https://github.com/cmglezpdev/veta/commit/d2440745fac62d02ca037ffe280c008c7e5eda62))
* **transcript:** render paragraphs as markdown with deep links ([f5ddc0e](https://github.com/cmglezpdev/veta/commit/f5ddc0e341377a75c30aee0c84c1610dd5bafbde))
* **transcript:** turn captions into a readable, deep-linked document ([72a823c](https://github.com/cmglezpdev/veta/commit/72a823c9efdca3f14a91eb6fc01d139ec4998c59))


### Documentation

* document the system and what was measured ([86290b6](https://github.com/cmglezpdev/veta/commit/86290b67fb345dace6fdfef553180399d66ed221))
* record the speaker-change finding and the calibration diagnosis ([f342c72](https://github.com/cmglezpdev/veta/commit/f342c72182f9649813b07e95c85b2f47e62b561b))


### Code Refactoring

* **domain:** move video metadata types out of the yt-dlp adapter ([49ed9bb](https://github.com/cmglezpdev/veta/commit/49ed9bbfeb24ec2c186712480ca0bb9ae0a8e963))
