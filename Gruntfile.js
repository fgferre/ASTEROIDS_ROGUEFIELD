module.exports = function (grunt) {
  grunt.initConfig({
    clean: ['dist'],
    copy: {
      main: {
        files: [
          {
            expand: true,
            cwd: 'src',
            src: ['**/*.html', '**/*.css', '**/*.js'],
            dest: 'dist/'
          }
        ]
      }
    }
  });

  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-copy');

  grunt.registerTask('build', ['clean', 'copy']);
  grunt.registerTask('test', []);
  grunt.registerTask('default', ['build']);
};
