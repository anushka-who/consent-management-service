exports.up = (pgm) => {
    pgm.sql(`
        INSERT INTO purposes (code, description)
        VALUES
            ('account_management',
             'Manage user accounts and account-related services'),

            ('service_delivery',
             'Provide and operate requested services'),

            ('identity_verification',
             'Verify the identity of the principal'),

            ('fraud_prevention',
             'Detect and prevent fraudulent activity'),

            ('security_monitoring',
             'Monitor systems and activity for security purposes'),

            ('customer_support',
             'Provide customer support and resolve service issues'),

            ('service_analytics',
             'Analyze service usage to improve system performance'),

            ('product_improvement',
             'Use service data to improve products and features'),

            ('personalization',
             'Personalize services and user experiences'),

            ('communications',
             'Send important service-related communications'),

            ('marketing',
             'Send promotional and marketing communications'),

            ('legal_compliance',
             'Process information required for legal and regulatory compliance')
        ON CONFLICT (code) DO NOTHING;
    `);
};

exports.down = (pgm) => {
    pgm.sql(`
        DELETE FROM purposes
        WHERE code IN (
            'account_management',
            'service_delivery',
            'identity_verification',
            'fraud_prevention',
            'security_monitoring',
            'customer_support',
            'service_analytics',
            'product_improvement',
            'personalization',
            'communications',
            'marketing',
            'legal_compliance'
        );
    `);
};