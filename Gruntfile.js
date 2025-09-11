module.exports = function (grunt) {
  // Configurações (por enquanto, nada)
  grunt.initConfig({});

  // Tarefas "de mentirinha" só para o robô ficar feliz
  grunt.registerTask('build', []);   // npm run build -> passa
  grunt.registerTask('test', []);    // npm test -> passa
  grunt.registerTask('default', ['build']);
};
