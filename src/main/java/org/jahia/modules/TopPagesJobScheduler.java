package org.jahia.modules;

import org.apache.commons.lang.StringUtils;
import org.jahia.services.scheduler.SchedulerService;
import org.osgi.service.component.annotations.Activate;
import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.ConfigurationPolicy;
import org.osgi.service.component.annotations.Deactivate;
import org.osgi.service.component.annotations.Reference;
import org.quartz.CronTrigger;
import org.quartz.JobDetail;
import org.quartz.Scheduler;
import org.quartz.SchedulerException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Map;

/**
 * Registers the weekly {@link UpdateTopPagesJob} with Jahia's persistent Quartz scheduler.
 *
 * <p>Replaces the {@code jobSchedulingBean} Spring bean: Declarative Services has no equivalent,
 * so the job detail and the cron trigger are built by hand and handed to
 * {@link SchedulerService#getScheduler()} -- the persistent scheduler, which is what
 * {@code ramJob=false} selected.
 *
 * <p>{@link #deactivate()} deletes the job again. That matters because the persistent scheduler is
 * JDBC-backed: a job left behind by a previous deployment would survive a redeploy and fire
 * alongside the new one. {@link #activate(Map)} deletes before scheduling as well, so a hard kill
 * that skipped deactivation still cannot produce a duplicate.
 *
 * <p>The cron expression is an OSGi configuration property, replacing the Spring placeholder
 * {@code ${topPagesCronExp:0 0 0 ? * 1 *}}. There is deliberately no {@code @Modified} method:
 * without one, SCR deactivates and reactivates the component when the configuration changes, which
 * unschedules the old trigger and schedules the new one.
 */
@Component(name = "org.jahia.modules.toppages",
        service = TopPagesJobScheduler.class,
        immediate = true,
        configurationPolicy = ConfigurationPolicy.OPTIONAL,
        property = {"topPagesCronExp=0 0 0 ? * 1 *"})
public class TopPagesJobScheduler {

    /**
     * Component name, and therefore the configuration PID. It is the name of the file shipped at
     * META-INF/configurations/org.jahia.modules.toppages.cfg and deployed to karaf/etc.
     */
    static final String PID = "org.jahia.modules.toppages";

    static final String CRON_PROPERTY = "topPagesCronExp";

    /** Every Sunday at midnight -- the default the Spring placeholder carried. */
    static final String DEFAULT_CRON = "0 0 0 ? * 1 *";

    private static final String JOB_NAME = "Top Pages";
    private static final String JOB_GROUP = "Jahia Top Pages module";
    private static final String JOB_DESCRIPTION = "Update top pages";
    private static final String TRIGGER_NAME = "ReferentielJobTrigger";

    private static final Logger logger = LoggerFactory.getLogger(TopPagesJobScheduler.class);

    private SchedulerService schedulerService;

    @Reference
    public void setSchedulerService(SchedulerService schedulerService) {
        this.schedulerService = schedulerService;
    }

    public void unsetSchedulerService(SchedulerService schedulerService) {
        this.schedulerService = null;
    }

    @Activate
    public void activate(Map<String, Object> properties) {
        String cronExpression = readCronExpression(properties);
        Scheduler scheduler = getScheduler();
        if (scheduler == null) {
            return;
        }
        try {
            // Deleting first also removes the job's triggers, so a job left behind by a previous
            // deployment cannot end up firing next to the one scheduled below.
            scheduler.deleteJob(JOB_NAME, JOB_GROUP);

            JobDetail jobDetail = new JobDetail(JOB_NAME, JOB_GROUP, UpdateTopPagesJob.class);
            jobDetail.setDescription(JOB_DESCRIPTION);
            CronTrigger trigger = new CronTrigger(TRIGGER_NAME, JOB_GROUP, JOB_NAME, JOB_GROUP, cronExpression);

            scheduler.scheduleJob(jobDetail, trigger);
            logger.info("TopPages: scheduled the top pages update job with cron expression '{}', next fire time {}",
                    cronExpression, trigger.getNextFireTime());
        } catch (Exception e) {
            // A bad cron expression is a configuration error, not a reason to fail the whole
            // bundle: everything else the module does stays available.
            logger.error("TopPages: unable to schedule the top pages update job with cron expression '{}'",
                    cronExpression, e);
        }
    }

    @Deactivate
    public void deactivate() {
        Scheduler scheduler = getScheduler();
        if (scheduler == null) {
            return;
        }
        try {
            scheduler.deleteJob(JOB_NAME, JOB_GROUP);
            logger.info("TopPages: unscheduled the top pages update job");
        } catch (SchedulerException e) {
            logger.error("TopPages: unable to unschedule the top pages update job", e);
        }
    }

    private String readCronExpression(Map<String, Object> properties) {
        Object configured = properties == null ? null : properties.get(CRON_PROPERTY);
        String cronExpression = configured == null ? null : String.valueOf(configured).trim();
        if (StringUtils.isEmpty(cronExpression)) {
            logger.warn("TopPages: no {} configured, falling back to '{}'", CRON_PROPERTY, DEFAULT_CRON);
            return DEFAULT_CRON;
        }
        return cronExpression;
    }

    private Scheduler getScheduler() {
        Scheduler scheduler = schedulerService == null ? null : schedulerService.getScheduler();
        if (scheduler == null) {
            logger.error("TopPages: the persistent scheduler is not available, the top pages update job is not scheduled");
        }
        return scheduler;
    }
}
