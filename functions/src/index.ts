import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Timestamp = admin.firestore.Timestamp;

admin.initializeApp(functions.config().firebase);
admin.firestore().settings({timestampsInSnapshots: true});

/** This converts alerts posted by Hedgebase into push notifications for Hedgelog **/
export const publishAlert = functions.firestore.document('alerts/{alertId}')
    .onWrite((snap, context) => {
        if (!snap.after.exists) return 1;

        const alert = snap.after.data();

        if (!alert.active) return 2;

        const message = {
            notification: {
                title: alert.message,
                body: 'Alert started at ' +
                    alert.start.toDate()
                        .toLocaleString('en-US', {timeZone: 'America/Vancouver'})
            },
            topic: 'alerts'
        };

        console.log(`new alert with message: ${alert.message}`);

        admin.messaging().send(message, false)
            .then((response) =>
                console.log(`message sent for alert: ${alert.message}`)
            )
            .catch((reason) =>
                console.error(`unable to send alert: ${reason}`)
            );

        return 0;
    });

/**
 * Triggered by 20 minutes ticks from an App Engine Cron task,
 * this checks to see if the temperature has updated recently, and alerts if it has not.
 * Cron created using https://github.com/firebase/functions-cron (slightly modified)
 **/
export const checkTemperatureDelay = functions.pubsub.topic('tick')
    .onPublish((event) => {
        admin.firestore().doc('temperatures/current').get()
            .then((snap) => {
                if (!snap.exists) {
                    console.error("Last temperature point doesn't exist");
                    return 1;
                }

                const last = snap.data().time.toDate();

                const compareTo = new Date(Date.now() - 20 * 60000);

                if (last <= compareTo) {
                    admin.firestore().doc('alerts/delayed').set({
                        active: true,
                        message: "Temperature updates delayed! Check power/network.",
                        start: Timestamp.now()
                    })
                        .then(() => console.log("Temp delay alert set"))
                        .catch((error) =>
                            console.error("unable to set temp delay alert", error));
                } else {
                    console.log("Last temperature within safe time range.")
                }

                return 0;
            })
            .catch((error) =>
                console.error("Unable to access last temperature point timestamp", error));

        return 0;
    });

/** This clears alerts set by checkTemperatureDelay when new temperatures are posted **/
export const clearTemperatureDelay = functions.firestore.document('temperatures/current')
    .onWrite((change) => {

        admin.firestore().doc('alerts/delayed').get()
            .then((snap) => {
                if (!snap.exists) {
                    console.log("Active delay alert not found");
                    return 1;
                }

                const alert = snap.data();

                admin.firestore().collection('alerts').add({
                    active: false,
                    message: alert.message,
                    start: alert.start,
                    end: Timestamp.now()
                })
                    .then(() => console.log("Delay alert copied"))
                    .catch((error) => console.error("unable to copy delay alert", error));

                admin.firestore().doc('alerts/delayed').delete()
                    .then(() => console.log("Active delay alert deleted"))
                    .catch((error) => console.error("Unable to delete alert", error));

                return 0;
            })
            .catch((error) => console.error("Unable to access alerts/delayed", error));

        return 0;
    });