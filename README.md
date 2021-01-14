# Jahia TopPages
a Jahia Community module to get the top visited pages from Awstats.pl script. Compatible with Jahia 8.0

# Usage
1. Install the module and enable it on the System Site and the required sites
2. Go to Jahia Administration > Configuration > Top Pages Configuration
3. Add AWStats configuration: You can configure the awsStats url, a regEx for the Awstats inclusion Filter and a regEx for the exclusion filter. You may also configure if the title is retrieved from the title tag of the page.
4. After adding the configuration. Go to any page and add a top pages node. You may configure the following properties:
    - Number of Results to display
    - Number of Months to aggregate (this will aggregate results for the past N months)
    - Override the Global configuration if needed
5. Publish the node
# Main Features
- Results are saved to and retrieved from JCR. Hence, it will not stop if there is any connection problems with the awstats.pl script.
- RegEX Inclusion and exclusion filter to fine tune the returned results
- The ability to aggregate results for the past N months
- The ability to get the page title from the HTML Source of the page
- The ability to override Global configuration if required.
- A Quartz job to automatically update the nodes, the default schedule is set to 12:AM on Sunday every week.
