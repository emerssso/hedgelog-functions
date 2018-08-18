import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as PubSub from '@google-cloud/pubsub';

admin.initializeApp(functions.config().firebase);

const pubsubClient = new PubSub({
    projectId: process.env.GCLOUD_PROJECT,
});

/** This converts alerts posted by Hedgebase into push notifications for Hedgelog **/
export const publishAlert = functions.firestore.document('alerts/{alertId}')
    .onWrite((snap, context) => {
        if(!snap.after.exists) return 1;

        const alert = snap.after.data();

        if (!alert.active) return 2;

        const message = {
            notification: {
                title: alert.message,
                body: 'Alert started at ' +
                    alert.start.toDate()
                        .toLocaleString('en-US', { timeZone: 'America/Vancouver' })
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

export const publishTemperature = functions.firestore.document('temperatures/current')
    .onUpdate((change, context) => {
        if(!change.after.exists) return 1;

        const message = new Buffer(JSON.stringify(change.after.data()));

        console.log(`Publishing temp message: ${message}`);

        pubsubClient
            .topic('temperatures')
            .publisher()
            .publish(message)
            .then(messageId => {
                console.log(`Message ${messageId} published.`);
            })
            .catch(err => {
                console.error('Unable to publish temp to pub/sub:', err);
            });

        return 0;
});