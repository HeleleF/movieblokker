# MB Fixer

## Project Structure

* `src/`: TypeScript source files
* `static/`: static files
* `dist/`: Extension directory

## Setup

`npm install` to install dependencies


## Build

`npm run build` or `gulp`


## Load extension to chrome

Replace `{{SITE_NAME}}` in `dist/manifest.json` with the actual name. <sup>*If you dont know the name, what are you doing here? ;)*</sup>

Load `dist` directory as unpacked extension (requires dev mode)
