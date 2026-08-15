@RestResource(urlMapping='/v1/signup')
global with sharing class SignupApi {
    
    @HttpPost
    global static String createContact() {
        RestRequest req = RestContext.request;
        String body = req.requestBody.toString();

        Map<String, Object> data = (Map<String, Object>) JSON.deserializeUntyped(body);
        
        String email = (String) data.get('Email');
        String lastName = (String) data.get('LastName');

        // Vérification des champs obligatoires
        if (String.isBlank(email) || String.isBlank(lastName)) {
            RestContext.response.statusCode = 400;
            return '{"error":"Email et Nom sont requis."}';
        }

        // Vérification si l'email existe déjà
        List<Contact> existing = [
            SELECT Id FROM Contact WHERE Email = :email LIMIT 1
        ];
        if (!existing.isEmpty()) {
            RestContext.response.statusCode = 409;
            return '{"error":"Email déjà existant."}';
        }

        // Création de l’account si fourni
        Account acc;
        String accName = (String) data.get('AccountName');
        if (!String.isBlank(accName)) {
            List<Account> accs = [SELECT Id FROM Account WHERE Name = :accName LIMIT 1];
            if (!accs.isEmpty()) {
                acc = accs[0];
            } else {
                acc = new Account(Name = accName);
                insert acc;
            }
        }

        // Création du contact
        Contact c = new Contact();
        c.FirstName = (String) data.get('FirstName');
        c.LastName = lastName;
        c.Email = email;
        c.MobilePhone = (String) data.get('MobilePhone');
        if (acc != null) {
            c.AccountId = acc.Id;
        }
        insert c;

        Map<String, Object> response = new Map<String, Object>();
        response.put('ok', true);
        response.put('contactId', c.Id);
        return JSON.serialize(response);
    }
}
