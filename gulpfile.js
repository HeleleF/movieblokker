const { src, task, dest, series, parallel, watch } = require('gulp');
const del = require('del');

const cleanCSS = require('gulp-clean-css');
const concat = require('gulp-concat');
const replace = require('gulp-replace');

const ts = require('gulp-typescript');
//const terser = require('gulp-terser');

const tsProject = ts.createProject('tsconfig.json');

task('css', () => {
    return src(['src/*.css'])
    .pipe(cleanCSS())
    .pipe(dest('dist'))
});

task('static', () => {
    return src(['static/**/*'])
    .pipe(dest('dist'))
});

task('ts', () => {
    return tsProject.src()
        .pipe(tsProject())
        .pipe(dest('dist'));
});
task('combine', () => {
    return src(['dist/utils.js', 'dist/interfaces.js', 'dist/scroller.js', 'dist/mb.js', 'dist/main.js'])
      .pipe(concat('content.js'))
      .pipe(replace(/^export /gm, ''))
      .pipe(replace(/^import.*$/gm, ''))
      //.pipe(terser())
      .pipe(dest('dist'));
});
task('clean', () => {
    return del(['dist/*.js', '!dist/content.js']);
});
task('js', series('ts', 'combine', 'clean'));

task('default', parallel('static', 'css', 'js'));

task('watchStatic', () => {
    return watch('static/**/*', { delay: 500 }, 'static')
});
task('watchCSS', () => {
    return watch('src/*.css', { delay: 500 }, 'css')
});
task('watchJS', () => {
    return watch('src/*.ts', { delay: 700 }, 'js')
});

task('dev', parallel('watchStatic', 'watchCSS', 'watchJS'))