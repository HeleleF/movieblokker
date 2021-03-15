# MB Fixer

**UPDATE** Site is currently down 😭

## Project Structure

* `src/`: TypeScript source files
* `static/`: static files
* `dist/`: Extension directory

## Setup

#### Dev

1. `npm install` to install dependencies
2. `npm run build` to create the dist folder
3. [Load extension](#load-extension)
4. `npm run start:dev` to watch for changes and update the dist folder
5. Change stuff
6. [Reload extension](#reload-extension)

#### User

1. Download the newest `dist.zip` from [this repo](https://github.com/HeleleF/movieblokker/releases) and unzip it
2. [Load extension](#load-extension)


## Load extension

1. Replace `{{SITE_NAME}}` in `dist/manifest.json` with the actual name. <sup>*If you dont know the name, what are you doing here? ;)*</sup>

2. Go to `chrome://extensions/` and activate developer mode (top right corner)
2. Load `dist` directory as unpacked extension (top left corner)


## Reload extension

To make sure that changes to the extension are applied correctly, go to
`chrome://extensions/`, find the extension and press the little update icon (bottom right corner next to the on/off toggle).

The **Update** button in the top left corner of the page toolbar will **NOT WORK!** (this only forces chrome's internal update check, which [by default happens every five hours](https://source.chromium.org/chromium/chromium/src/+/master:extensions/common/constants.cc;l=48?q=kDefaultUpdateFrequencySeconds&ss=chromium)) 


## Troubleshoot

Things to check when nothing works:

- check if the site name in `manifest.json` is up-to-date (TLD changes like from `.to` to `.tv` are very common)

- Dont forget to apply any updates by [reloading correctly](##reload-extension)

- to check if the extension actually runs on the site, open the dev tools console (F12) and check if the global variable `M` exists.
- Another way is to check **Sources -> Content scripts** in dev tools. If the extension is not there, the `manifest.json` needs to be updated
