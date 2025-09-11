module.exports = function(grunt) {
  // Configuração do projeto
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    
    // Configuração para limpeza de arquivos
    clean: {
      dist: ['dist/**/*'],
      temp: ['temp/**/*']
    },
    
    // Concatenação de arquivos JavaScript
    concat: {
      options: {
        separator: ';'
      },
      dist: {
        src: ['src/**/*.js'],
        dest: 'dist/app.js'
      }
    },
    
    // Minificação de JavaScript
    uglify: {
      options: {
        banner: '/*! <%= pkg.name %> <%= grunt.template.today("yyyy-mm-dd") %> */\n'
      },
      build: {
        src: 'dist/app.js',
        dest: 'dist/app.min.js'
      }
    },
    
    // Minificação de CSS
    cssmin: {
      target: {
        files: [{
          expand: true,
          cwd: 'src/css',
          src: ['*.css', '!*.min.css'],
          dest: 'dist/css',
          ext: '.min.css'
        }]
      }
    },
    
    // Cópia de arquivos
    copy: {
      main: {
        files: [
          // Copia arquivos HTML
          {
            expand: true,
            cwd: 'src/',
            src: ['*.html'],
            dest: 'dist/'
          },
          // Copia assets
          {
            expand: true,
            cwd: 'assets/',
            src: ['**'],
            dest: 'dist/assets/'
          }
        ]
      }
    },
    
    // Watch para desenvolvimento
    watch: {
      scripts: {
        files: ['src/**/*.js'],
        tasks: ['concat', 'uglify'],
        options: {
          spawn: false,
        },
      },
      css: {
        files: ['src/css/*.css'],
        tasks: ['cssmin'],
        options: {
          spawn: false,
        },
      }
    },
    
    // Servidor local para desenvolvimento
    connect: {
      server: {
        options: {
          port: 8000,
          hostname: 'localhost',
          base: 'dist',
          open: true
        }
      }
    }
  });
  
  // Carregamento dos plugins
  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-contrib-cssmin');
  grunt.loadNpmTasks('grunt-contrib-copy');
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-contrib-connect');
  
  // Tarefas padrão
  grunt.registerTask('default', ['clean', 'concat', 'uglify', 'cssmin', 'copy']);
  grunt.registerTask('build', ['clean', 'concat', 'uglify', 'cssmin', 'copy']);
  grunt.registerTask('serve', ['build', 'connect', 'watch']);
  grunt.registerTask('dev', ['concat', 'copy', 'connect', 'watch']);
};
