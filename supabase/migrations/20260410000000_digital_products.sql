-- Create digital products table
CREATE TABLE IF NOT EXISTS public.digital_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    product_type VARCHAR(50) CHECK (product_type IN ('ebook', 'course')),
    price_cents INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create product deliveries table
CREATE TABLE IF NOT EXISTS public.product_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.digital_products(id) ON DELETE CASCADE,
    customer_email TEXT NOT NULL,
    stripe_session_id TEXT,
    delivery_status VARCHAR(50) CHECK (delivery_status IN ('pending', 'delivered', 'failed')) DEFAULT 'pending',
    secure_link TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create updated_at triggers
CREATE OR REPLACE FUNCTION update_digital_products_modtime()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_digital_products_modtime
BEFORE UPDATE ON public.digital_products
FOR EACH ROW
EXECUTE FUNCTION update_digital_products_modtime();

CREATE OR REPLACE FUNCTION update_product_deliveries_modtime()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_product_deliveries_modtime
BEFORE UPDATE ON public.product_deliveries
FOR EACH ROW
EXECUTE FUNCTION update_product_deliveries_modtime();

-- Enable Row Level Security
ALTER TABLE public.digital_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_deliveries ENABLE ROW LEVEL SECURITY;

-- Policies for digital_products
CREATE POLICY "Allow select on digital_products for authenticated users"
ON public.digital_products FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all access on digital_products for admins"
ON public.digital_products FOR ALL
USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'admin');

-- Policies for product_deliveries
CREATE POLICY "Allow select on product_deliveries for authenticated users"
ON public.product_deliveries FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all access on product_deliveries for admins"
ON public.product_deliveries FOR ALL
USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'admin');
