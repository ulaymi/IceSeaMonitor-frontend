# IceSeaMonitor Frontend

Публичная статическая демонстрация интерфейса IceSeaMonitor для поиска
спутниковых сцен и мониторинга морского льда.

**Открыть сайт:**
[ulaymi.github.io/IceSeaMonitor-frontend](https://ulaymi.github.io/IceSeaMonitor-frontend/)

## Ограничение

GitHub Pages публикует только HTML, CSS, JavaScript и статические ресурсы.
Поиск Copernicus, загрузка SAFE, Yandex Object Storage и обработка ESA SNAP
требуют отдельно развёрнутый Julia backend.

Адрес backend можно указать в `index.html`:

```html
<meta name="ice-api-base" content="https://example.com" />
```

Backend должен работать по HTTPS и разрешать CORS-запросы с домена GitHub
Pages. Секретные ключи CDSE и Object Storage должны храниться только на
сервере.
