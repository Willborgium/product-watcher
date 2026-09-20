# instructions

- verify the app can parse prices from the following example URL:
  - https://www.target.com/p/goldfish-colors-cheddar-cheese-crackers-27-3oz/-/A-88951127
  - https://www.walmart.com/ip/Goldfish-Cheddar-Cheese-Crackers-Baked-Snack-Crackers-1-oz-on-The-Go-Snack-Packs-20-Count-Box/253680066
  - https://www.amazon.com/Pepperidge-Farm-Goldfish-Cheddar-Ounce/dp/B079LJBZ6V
  - https://www.lowes.com/pd/NeverKink-Teknor-Apex-Neverkink-Heavy-Duty-5-8IN100FT/5000141109
  - https://www.homedepot.com/p/Gorilla-ToughLite-5-8-in-x-100-ft-Heavy-Duty-Garden-Hose-HYB55800/325990190
  - https://www.bestbuy.com/product/corsair-galleon-100-sd-stream-deck-integrated-mechanical-gaming-keyboard-black/J39TSCSCRT/sku/6667833
  - https://www.newegg.com/redragon-k556-red-switch-black/p/32N-0003-001A8
  - https://www.tractorsupply.com/tsc/product/groundwork-5-8-in-x-50-ft-mid-duty-garden-hose-400-psi-green-2579108
- consider whether these sites expose a public API for getting price data
  - apis are preferrable to scraping

# technical details

- it is okay if the app implements a unique parser for each site
- the app must also implement a generic fallback parser for sites it does not have a parser for, or if the site-specific parser fails
- outcomes must be logged clearly
  - custom parsing succeeded
  - custom parsing failed, generic parsing succeeded
  - custom parsing failed, generic parsing failed
  - generic parsing succeeded
  - generic parsing failed
