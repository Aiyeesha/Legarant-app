@IsTest
private class SignupApiTest {

    @IsTest
    static void testCreateContact_OK() {
        // Prépare la requête REST avec un email unique
        String body = JSON.serialize(new Map<String, Object>{
            'FirstName' => 'Test',
            'LastName' => 'User',
            'Email' => 'unique.user@example.com',
            'MobilePhone' => '0600000000',
            'AccountName' => 'Test Account'
        });

        RestRequest req = new RestRequest();
        req.requestUri = '/services/apexrest/v1/signup';
        req.httpMethod = 'POST';
        req.requestBody = Blob.valueOf(body);
        RestContext.request = req;
        RestContext.response = new RestResponse();

        // Appel de la méthode
        String result = SignupApi.createContact();

        // Analyse de la réponse
        System.assertNotEquals(null, result, 'La réponse ne doit pas être vide');
        Map<String, Object> json = (Map<String, Object>) JSON.deserializeUntyped(result);
        System.assertEquals(true, json.get('ok'), 'Le champ ok doit être true');
        
        // Vérifie que l'ID renvoyé est bien un ID valide
        Id contactId = (Id) json.get('contactId');
        System.assertNotEquals(null, contactId, 'Un ID de contact doit être retourné');

        // Vérifie que le contact existe
        Contact c = [SELECT Id, Email, AccountId FROM Contact WHERE Id = :contactId LIMIT 1];
        System.assertEquals('unique.user@example.com', c.Email);
        System.assertNotEquals(null, c.AccountId, 'Un compte doit être associé');
    }

    @IsTest
    static void testCreateContact_EmailExiste() {
        // Création préalable d’un contact
        Contact existing = new Contact(
            LastName = 'Dupont',
            Email = 'dupont@example.com'
        );
        insert existing;

        // Tentative de création avec le même email
        String body = JSON.serialize(new Map<String, Object>{
            'FirstName' => 'Jean',
            'LastName' => 'Dupont',
            'Email' => 'dupont@example.com'
        });

        RestRequest req = new RestRequest();
        req.requestUri = '/services/apexrest/v1/signup';
        req.httpMethod = 'POST';
        req.requestBody = Blob.valueOf(body);
        RestContext.request = req;
        RestContext.response = new RestResponse();

        // Appel de la méthode
        String result = SignupApi.createContact();

        System.assert(result.containsIgnoreCase('Email déjà existant'), 'Le message d\'erreur doit indiquer l\'email existant');
        System.assertEquals(409, RestContext.response.statusCode, 'Le code retour doit être 409');
    }

    @IsTest
    static void testCreateContact_ManqueEmailOuNom() {
        // Cas sans email
        String body1 = JSON.serialize(new Map<String, Object>{
            'FirstName' => 'Test',
            'LastName' => 'NoEmail'
        });

        RestRequest req1 = new RestRequest();
        req1.requestUri = '/services/apexrest/v1/signup';
        req1.httpMethod = 'POST';
        req1.requestBody = Blob.valueOf(body1);
        RestContext.request = req1;
        RestContext.response = new RestResponse();
        String result1 = SignupApi.createContact();
        System.assertEquals(400, RestContext.response.statusCode, 'Erreur 400 attendue sans email');

        // Cas sans nom
        String body2 = JSON.serialize(new Map<String, Object>{
            'FirstName' => 'Test',
            'Email' => 'no.lastname@example.com'
        });

        RestRequest req2 = new RestRequest();
        req2.requestUri = '/services/apexrest/v1/signup';
        req2.httpMethod = 'POST';
        req2.requestBody = Blob.valueOf(body2);
        RestContext.request = req2;
        RestContext.response = new RestResponse();
        String result2 = SignupApi.createContact();
        System.assertEquals(400, RestContext.response.statusCode, 'Erreur 400 attendue sans nom');
    }
}
