const { src, task, dest } = require('gulp');
const cleanCSS = require('gulp-clean-css');
const ts = require('gulp-typescript');
//const terser = require('gulp-terser');

const tsProject = ts.createProject('tsconfig.json');

task('build', () => {

    src(['src/*.css'])
        .pipe(cleanCSS())
        .pipe(dest('dist'))

    return tsProject.src()
        .pipe(tsProject())
        //.pipe(terser())
        .pipe(dest('dist'));
});