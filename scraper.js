const puppeteer = require('puppeteer');
const fs = require('fs-extra');
const { baseUrl, maxRetries, proxyFilePath, userAgentFilePath, queueFilePath, crawledFilePath, moviesFilePath } = require('./config');
// const { connectDB, saveMovie } = require('./database');
const logger = require('./logger');
require('dotenv').config();

const loadProxies = () => fs.readFileSync(proxyFilePath, 'utf8').split('\n').filter(Boolean);
const loadUserAgents = () => fs.readFileSync(userAgentFilePath, 'utf8').split('\n').filter(Boolean);

const proxies = loadProxies();
const userAgents = loadUserAgents();
let queue = new Set();
let crawled = new Set();
let movies = [];
const proxyUsername = process.env.PROXY_USERNAME;
const proxyPassword = process.env.PROXY_PASSWORD;

const randomDelay = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getRandomProxy = () => proxies[Math.floor(Math.random() * proxies.length)];
const getRandomUserAgent = () => userAgents[Math.floor(Math.random() * userAgents.length)];

const script = "Object.defineProperty(navigator, 'webdriver', {get: () => false})"
const features = "window.xv.disclaimer.setFeatures('accept-all');"

const saveState = async () => {
  fs.writeFileSync(queueFilePath, JSON.stringify(Array.from(queue)));
  fs.writeFileSync(crawledFilePath, JSON.stringify(Array.from(crawled)));
};

const loadState = async () => {
  if (fs.existsSync(queueFilePath)) {
    try {
      const queueData = fs.readFileSync(queueFilePath, 'utf8');
      queue = new Set(JSON.parse(queueData));
    } catch (error) {
      logger.warn(`Failed to load queue from file: ${error.message}`);
      queue = new Set();
    }
  }
  if (fs.existsSync(crawledFilePath)) {
    try {
      const crawledData = fs.readFileSync(crawledFilePath, 'utf8');
      crawled = new Set(JSON.parse(crawledData));
    } catch (error) {
      logger.warn(`Failed to load crawled from file: ${error.message}`);
      crawled = new Set();
    }
  }
};

const setRequestInterception = async (page) => {
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const resourceType = req.resourceType();
    if (['image', 'stylesheet', 'font'].includes(resourceType)) {
      req.abort();
    } else {
      req.continue();
    }
  });
};

const browserInfo = async (page) => {
  const info = await page.evaluate(() => {
    return {
      agent: navigator.userAgent,
      isWebDriver: navigator.webdriver,
      language: navigator.language
    }
  })

  console.log(info);
}

const clickDisclaimer = async (page) => {
  // const enter = await page.waitForSelector('#disclaimer_background .disclaimer-enter-btn')
  // await enter.click()

  // const cookies = await page.waitForSelector('#disclaimer_background .text-top')
  // await cookies.parentElement.click()
  // await page.waitForSelector('#disclaimer_background .disclaimer-enter-btn');
  // await page.waitForSelector('#disclaimer_background .text-top');

 const disclaimer = await page.evaluate(() => {

  const disclaimerBtn = document.querySelector('#disclaimer_background .disclaimer-enter-btn')

  if(disclaimerBtn){
    disclaimerBtn.click()
    const cookieSpan = document.querySelector('#disclaimer_background .text-top')
    if(cookieSpan){
      cookieSpan.parentElement.click()
      return { d: disclaimerBtn.innerText, c: cookieSpan.innerText }
    }
  } else{
    return {};
  }

})
 console.log(disclaimer);
}

const scrapeMoviePage = async (page, url) => {
  try {
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 50000 });
  // await page.evaluateOnNewDocument(features);
  await clickDisclaimer(page)
  await browserInfo(page)

  // const accept = await page.evaluate(() => {
  //   window.xv.disclaimer.close_pop(event, null, 'straight')
  //   window.xv.disclaimer.setFeatures('accept-all');

  //   return "Accepted All Cookies if there was any"
  // })

  // console.log(accept);

  const movie = await page.evaluate(() => {
    const data = {};
    const div = document.querySelector('#video-player-bg');
    if (!div) return null;
    const text = div.children[5]?.textContent || '';

    const regexMap = {
      title: /html5player\.setVideoTitle\('([^']+)'\);/,
      videoUrlLow: /html5player\.setVideoUrlLow\('([^']+)'\);/,
      videoUrlHigh: /html5player\.setVideoUrlHigh\('([^']+)'\);/,
      videoUrlHls: /html5player\.setVideoHLS\('([^']+)'\);/,
      thumbnailUrl: /html5player\.setThumbUrl169\('([^']+)'\);/,
      uploaderName: /html5player\.setUploaderName\('([^']+)'\);/,
    };

    for (const key in regexMap) {
      const match = text.match(regexMap[key]);
      data[key] = match ? match[1] : null;
    }

    const videoQuality = document.querySelector('.video-hd-mark')?.textContent || '';

    const metadata = Array.from(document.querySelectorAll('.video-metadata > ul li.model'));
    const pornstars = metadata.map((li) => li.querySelector('a').href.split('/')[4]);

    const tags = Array.from(document.querySelectorAll('.is-keyword')).map((el) => el.innerText);
    const duration = document.querySelector('.duration')?.textContent || '';
    const views = document.querySelector('#v-views .mobile-hide')?.textContent || '';
    const comments = document.querySelector('.comments .badge')?.textContent || '';

    return { ...data, pornstars, videoQuality, duration, views, comments, tags };
  });

  return movie;
  } catch(error) {
      logger.warn(`${error.message}`); // Error while scraping ${url}: 
      logger.info(`Continueng to Scrape next Url`);
  }
};

const scrapePage = async (browser, url) => {
  let retries = 0;
  while (retries < maxRetries) {
    try {
      const page = await browser.newPage();
      await page.authenticate({ username: proxyUsername, password: proxyPassword });
      await page.setUserAgent(getRandomUserAgent());
      page.evaluateOnNewDocument(script);

      await setRequestInterception(page);

      logger.info(`Scraping: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 50000 });
      // await page.evaluateOnNewDocument(features);
      await browserInfo(page)
      await clickDisclaimer(page)
      // const accept = await page.evaluate(() => {
      //   window.xv.disclaimer.close_pop(event, null, 'straight')
      //   window.xv.disclaimer.setFeatures('accept-all');
      // })

      // console.log(accept);


      await page.waitForSelector('.thumb-block');

      const movieLinks = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.thumb-block')).map(block => block.querySelector('.thumb a').href);
      });

      for (const link of movieLinks) {
        if (!crawled.has(link)) {
          queue.add(link);
        }
      }

      const nextPageLink = await page.evaluate(() => {
        const nextButton = document.querySelector('.pagination ul .next-page');
        return nextButton ? `https://www.xvideos.com${nextButton.attributes[0].textContent}/` : null;
      });

      if (nextPageLink && !crawled.has(nextPageLink)) {
        queue.add(nextPageLink);
      }

      console.log(nextPageLink);

      // await page.close();
      crawled.add(url);
      return;
    } catch (error) {
      logger.warn(`Error scraping ${url}: ${error.message}`);

      retries++;
      if (retries >= maxRetries) {
        logger.error(`Max retries reached for ${url}`);
        // await browser.close();
        // crawled.add(url);
      }
    }
  }
};

const main = async () => {
  // await connectDB();
  await loadState();

  if (queue.size === 0) {
    queue.add(baseUrl);
  }

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox' , `--proxy-server=${getRandomProxy()}`] //
  });

  try {
    while (queue.size > 0) {
      const url = queue.values().next().value;

      if (!crawled.has(url)) {
        if (url.includes('/video')) {
          const page = await browser.newPage();
          await page.authenticate({ username: proxyUsername, password: proxyPassword });
          await page.setUserAgent(getRandomUserAgent());
          page.evaluateOnNewDocument(script);
          
          // await setRequestInterception(page);

          const movie = await scrapeMoviePage(page, url);
          await page.close();
          if (movie) {
            // await saveMovie(movie);
            movies.push(movie);
            queue.delete(url);
            crawled.add(url)
            logger.info(`Scraped movie: ${movie.title}`);
            if (movies.length % 10 === 0) {
              // fs.writeFileSync(moviesFilePath, JSON.stringify(movies, null, 2));
              logger.info(`Saved ${movies.length} movies`);
            }
          }
        } else {
          await scrapePage(browser, url);
          queue.delete(url);
        }
      }

      await saveState();
    }

    if (movies.length > 0) {
      // fs.writeFileSync(moviesFilePath, JSON.stringify(movies, null, 2));
      logger.info(`Finished scraping. Total movies: ${movies.length}`);
    }
  } finally {
    // await browser.close();
  }
};

main().catch(console.error);