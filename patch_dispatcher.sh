sed -i '/const isHighStakes/i \
    if (action_type === "generate_pdf_artifact") {\
        const { content, bucket, filename } = payload;\
        try {\
            const { generatePdf } = await import("../_shared/pdf-generators/index.ts");\
            const pdfBytes = await generatePdf("UNIFIRST_PROSPECT_RESEARCH", { profile: content });\
            const { error: uploadError } = await supabaseAdmin.storage\
                .from(bucket || "secure_artifacts")\
                .upload(filename, pdfBytes, {\
                    contentType: "application/pdf",\
                    upsert: true\
                });\
            if (uploadError) throw uploadError;\
            return new Response(JSON.stringify({ success: true, message: "PDF Generated and Uploaded" }), {\
                status: 200,\
                headers: { ...corsHeaders, "Content-Type": "application/json" }\
            });\
        } catch (e) {\
            throw e;\
        }\
    }\
' supabase/functions/universal-dispatcher/index.ts
