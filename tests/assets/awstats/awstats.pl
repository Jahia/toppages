<!--
  Static stand-in for an AWStats `output=urldetail` report.

  TopPages parses this with jsoup (see org.jahia.modules.TopPages#getPages):
    * it takes the SECOND `table.aws_data` -- the first one below is the summary
      header AWStats always emits before the data table, and it must stay there;
    * it skips the first `tr` of that table (the header row);
    * per row it reads `td.aws > a[href]` for the URL and `td:nth-child(2)` for
      the hit count, stripping commas before `Integer.parseInt`.

  Two consequences for anyone editing this fixture:
    1. the count cell must contain the number and NOTHING else -- no surrounding
       whitespace or newline, or parseInt throws and the whole table is dropped;
    2. hrefs must be ABSOLUTE, because the `titleFromHTML` code path feeds them
       straight to `new URIBuilder(href)` and fetches them from the Jahia JVM.

  nginx ignores the ?year=&month=&urlfilter=... query string TopPages appends, so
  every month of a multi-month aggregation reads these same rows -- which is what
  makes the aggregation assertion in 02-topPagesAction.cy.ts exact.
-->
<html>
<head><title>Statistics for toppages-e2e</title></head>
<body>

<table class="aws_data">
    <tr><th>Pages-URL</th><th>Viewed</th></tr>
    <tr><td>Summary</td><td>14950</td></tr>
</table>

<table class="aws_data">
    <tr><th>URL</th><th>Viewed</th><th>Average size</th><th>Entry</th><th>Exit</th></tr>
    <tr>
        <td class="aws"><a href="http://awstats/pages/home.html">/home.html</a></td>
        <td>5,000</td>
        <td>12345</td>
        <td>2000</td>
        <td>1500</td>
    </tr>
    <tr>
        <td class="aws"><a href="http://awstats/pages/our-company.html">/our-company.html</a></td>
        <td>4,200</td>
        <td>12345</td>
        <td>900</td>
        <td>700</td>
    </tr>
    <tr>
        <td class="aws"><a href="http://awstats/pages/contact-us.html">/contact-us.html</a></td>
        <td>3,100</td>
        <td>12345</td>
        <td>400</td>
        <td>380</td>
    </tr>
    <tr>
        <td class="aws"><a href="http://awstats/pages/news-and-events.html">/news-and-events.html</a></td>
        <td>1,750</td>
        <td>12345</td>
        <td>200</td>
        <td>190</td>
    </tr>
    <tr>
        <td class="aws"><a href="http://awstats/pages/legal-notice.html">/legal-notice.html</a></td>
        <td>900</td>
        <td>12345</td>
        <td>50</td>
        <td>48</td>
    </tr>
</table>

</body>
</html>
