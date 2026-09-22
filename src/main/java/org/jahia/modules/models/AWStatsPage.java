package org.jahia.modules.models;

import java.util.Objects;

public class AWStatsPage implements Comparable<AWStatsPage> {

    private String url;
    private String title;
    private long viewCount;

    public AWStatsPage(String url, String title, long viewCount) {
        this.url = url;
        this.title = title;
        this.viewCount = viewCount;
    }

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public long getViewCount() {
        return viewCount;
    }

    public void setViewCount(long viewCount) {
        this.viewCount = viewCount;
    }

    @Override
    public int compareTo(AWStatsPage o) {
        return (int) (this.viewCount - o.viewCount);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof AWStatsPage)) return false;
        AWStatsPage other = (AWStatsPage) o;
        return viewCount == other.viewCount &&
                Objects.equals(url, other.url) &&
                Objects.equals(title, other.title);
    }

    @Override
    public int hashCode() {
        return Objects.hash(url, title, viewCount);
    }
}
