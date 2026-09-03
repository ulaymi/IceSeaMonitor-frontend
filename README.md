# NatObserve Frontend

Публичная статическая демонстрация NatObserve — общей платформы для поиска
спутниковых сцен, мониторинга морского льда и оценки опустынивания.

**Открыть сайт:**
[ulaymi.github.io/IceSeaMonitor-frontend](https://ulaymi.github.io/IceSeaMonitor-frontend/)

## Ограничение

GitHub Pages публикует только HTML, CSS, JavaScript и статические ресурсы.
Поиск Copernicus, загрузка SAFE, Yandex Object Storage, обработка ESA SNAP и
модель GeoIntellect требуют отдельно развёрнутый Julia backend. До его
подключения карта не показывает синтетические результаты, а блок отчёта
опустынивания использует явно помеченную демонстрационную сводку.

Адрес backend можно указать в `index.html`:

```html
<meta name="ice-api-base" content="https://example.com" />
```

Backend должен работать по HTTPS и разрешать CORS-запросы с домена GitHub
Pages. Секретные ключи CDSE и Object Storage должны храниться только на
сервере.
