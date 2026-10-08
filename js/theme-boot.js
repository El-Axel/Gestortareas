// Se carga antes que el CSS para pintar con el tema correcto desde el primer momento.
(function () {
  var pref = 'dark';
  try {
    pref = (JSON.parse(localStorage.getItem('claqueta:local:v1') || '{}') || {}).theme || 'dark';
  } catch (e) {}
  var light = pref === 'light' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: light)').matches);
  document.documentElement.setAttribute('data-theme', light ? 'light' : 'dark');
})();
