# description

- this application will be used to monitor the price of specific products across specific sites and report daily analytics and potentially notify subscribers
- for example
  - if i want to purchase a bike, i would create a "product watcher" for a product called "bike"
  - i would then add links to popular sites where i can purchase this bike (like target, walmart, dicks sporting goods, lowes, home depot, etc.)
    - these links should specifically be to the product, not just to the company landing page
  - the server side cron job will
    - run daily
    - scrape the price from the given page
    - record the results to some durable storage
    - notify the subscribers if the price found is lower than the price yesterday
  - the web app will
    - show these prices in a line chart
    - list the recorded links in order from lowest to highest price
    - show the lowest price today and the lowest price historically
    - allow users to subscribe to products
      - subscribing just means linking an email address to the product to receive notifications when prices drop
      - products do not need subscribers to scrape
    - allow users to turn off scraping
      - if disabled, the cron job will skip scraping price data

# technical details

- this app will be hosted on Cloudflare and use their free-tier products like pages, workers, and R2
- this app will deploy on merges to main in github
