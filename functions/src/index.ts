import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp(functions.config().firebase);

/** This converts alerts posted by Hedgebase into push notifications for Hedgelog **/
export const publishAlert = functions.firestore.document('alerts/{alertId}')
    .onWrite((snap, context) => {
        if(!snap.after.exists) return -1;

        const alert = snap.after.data();

        if (!alert.active) return 0;

        const message = {
            notification: {
                title: alert.message,
                body: 'Alert started at ' +
                    alert.start.toDate()
                        .toLocaleString('en-US', { timeZone: 'America/Vancouver' })
            },
            topic: 'alerts'
        };

        console.log("new alert with message: " + alert.message);

        admin.messaging().send(message, false)
            .then((response) =>
                console.log("message sent for alert: " + alert.message)
            )
            .catch((reason) =>
                console.error("unable to send alert: " + reason)
            );

        return 1;
    });